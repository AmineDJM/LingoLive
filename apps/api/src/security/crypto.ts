import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Application-layer encryption for anything a user actually said.
 *
 * Format (single string, `.`-separated, all base64url):
 *   v<version>.<iv>.<authTag>.<ciphertext>
 *
 * The version prefix is what makes key rotation possible without a migration:
 * new writes use the current key, old reads fall back to the retired one.
 * See docs/SECURITY.md#key-rotation.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96 bits — the value GCM is specified for.
const AUTH_TAG_BYTES = 16;

export interface EncryptionKey {
  readonly version: number;
  readonly key: Buffer;
}

export class TranscriptCipher {
  private readonly keysByVersion = new Map<number, Buffer>();
  private readonly currentVersion: number;

  constructor(currentKeyBase64: string, currentVersion: number, retiredKeys: EncryptionKey[] = []) {
    const key = Buffer.from(currentKeyBase64, 'base64');
    if (key.length !== 32) {
      throw new Error(
        'TRANSCRIPT_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256). ' +
          'Generate one with: node infra/scripts/generate-secrets.mjs',
      );
    }
    this.currentVersion = currentVersion;
    this.keysByVersion.set(currentVersion, key);
    for (const retired of retiredKeys) {
      this.keysByVersion.set(retired.version, retired.key);
    }
  }

  encrypt(plaintext: string): string {
    const key = this.keysByVersion.get(this.currentVersion);
    if (!key) throw new Error('No encryption key configured for the current version');

    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [
      `v${this.currentVersion}`,
      iv.toString('base64url'),
      authTag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  decrypt(payload: string): string {
    const parts = payload.split('.');
    if (parts.length !== 4) {
      throw new Error('Malformed ciphertext');
    }
    const [versionPart, ivPart, tagPart, dataPart] = parts as [string, string, string, string];
    if (!versionPart.startsWith('v')) throw new Error('Malformed ciphertext version');

    const version = Number.parseInt(versionPart.slice(1), 10);
    const key = this.keysByVersion.get(version);
    if (!key) {
      throw new Error(`No key available for encryption version ${version}`);
    }

    const iv = Buffer.from(ivPart, 'base64url');
    const authTag = Buffer.from(tagPart, 'base64url');
    if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
      throw new Error('Malformed ciphertext parameters');
    }

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    // `final()` throws if the tag does not verify — tampering fails loudly.
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  /** Decrypts without throwing, for admin views over possibly-rotated data. */
  tryDecrypt(payload: string): string | null {
    try {
      return this.decrypt(payload);
    } catch {
      return null;
    }
  }

  get version(): number {
    return this.currentVersion;
  }
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/**
 * Keyed hash for identifiers we must be able to look up but never need to read
 * back: anonymous device ids and LingoBusiness access codes.
 *
 * HMAC-SHA256 with the server secret, not a bare digest — a 6-digit code has
 * only a million possibilities, so an unkeyed hash would be trivially
 * reversible from a database dump.
 */
export function hashIdentifier(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

// ---------------------------------------------------------------------------
// Access codes
// ---------------------------------------------------------------------------

/**
 * A uniformly random 6-digit code. `randomInt` is used rather than
 * `Math.random` because this value gates access to a live room.
 */
export function generateAccessCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function generateAnonymousId(): string {
  return `anon_${randomBytes(16).toString('hex')}`;
}

export function generateRequestId(): string {
  return `req_${randomBytes(8).toString('hex')}`;
}
