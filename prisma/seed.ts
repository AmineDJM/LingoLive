/**
 * Development seed.
 *
 * Creates enough realistic data that every screen has something to show on a
 * fresh checkout: an admin, a Pro user, a guest, saved transcripts in several
 * languages, a live LingoBusiness room with a printable code, and a usage
 * history so the operator console's charts are not empty.
 *
 * Everything it writes goes through the same encryption path the API uses —
 * the seed cannot create plaintext transcripts.
 */
import { createHmac, randomBytes, randomInt } from 'node:crypto';
import { PrismaClient, Plan, SessionKind, SessionStatus, UsageMetric } from '@prisma/client';

const prisma = new PrismaClient();

const SIGNING_SECRET =
  process.env.SESSION_SIGNING_SECRET ?? 'dev-only-session-signing-secret-change-me-32chars';
const ENCRYPTION_KEY =
  process.env.TRANSCRIPT_ENCRYPTION_KEY ?? 'ZGV2LW9ubHktMzJieXRlLWtleS1kby1ub3QtdXNlISE=';
const ADMIN_EMAIL = (process.env.ADMIN_EMAILS ?? 'admin@lingolive.local').split(',')[0]!.trim();

function hashIdentifier(value: string): string {
  return createHmac('sha256', SIGNING_SECRET).update(value).digest('base64url');
}

/** Mirrors apps/api/src/security/crypto.ts — the seed writes real ciphertext. */
async function encrypt(plaintext: string): Promise<string> {
  const { createCipheriv } = await import('node:crypto');
  const key = Buffer.from(ENCRYPTION_KEY, 'base64');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

const CONVERSATIONS: Array<{
  title: string;
  kind: SessionKind;
  readingLanguage: string;
  languages: string[];
  lines: Array<{ text: string; language: string; translations: Record<string, string> }>;
}> = [
  {
    title: 'Réunion produit — résultats Q3',
    kind: SessionKind.PERSONAL_LISTEN,
    readingLanguage: 'en',
    languages: ['fr', 'en'],
    lines: [
      {
        text: 'Nous allons maintenant présenter les résultats du troisième trimestre.',
        language: 'fr',
        translations: { en: 'We will now present the third-quarter results.' },
      },
      {
        text: 'Le chiffre d’affaires a progressé de douze pour cent sur un an.',
        language: 'fr',
        translations: { en: 'Revenue grew by twelve percent year on year.' },
      },
      {
        text: 'La prochaine réunion aura lieu le quinze mars à quatorze heures.',
        language: 'fr',
        translations: { en: 'The next meeting will take place on March fifteenth at two p.m.' },
      },
    ],
  },
  {
    title: 'Conversation — gare de Lisbonne',
    kind: SessionKind.PERSONAL_DISCUSS,
    readingLanguage: 'original',
    languages: ['pt-BR', 'fr'],
    lines: [
      {
        text: 'Onde fica a estação de trem mais próxima?',
        language: 'pt-BR',
        translations: { fr: 'Où se trouve la gare la plus proche ?' },
      },
      {
        text: 'Elle est à dix minutes à pied, tout droit puis à gauche.',
        language: 'fr',
        translations: { 'pt-BR': 'Fica a dez minutos a pé, sempre em frente e depois à esquerda.' },
      },
    ],
  },
  {
    title: 'مؤتمر — الجلسة الافتتاحية',
    kind: SessionKind.PERSONAL_LISTEN,
    readingLanguage: 'fr',
    languages: ['ar', 'fr'],
    lines: [
      {
        text: 'أهلاً بالجميع، شكراً لانضمامكم إلى هذه الجلسة اليوم.',
        language: 'ar',
        translations: { fr: 'Bienvenue à tous, merci de participer à cette session aujourd’hui.' },
      },
      {
        text: 'الاجتماع القادم يوم الخامس عشر من مارس في الساعة الثانية ظهراً.',
        language: 'ar',
        translations: { fr: 'La prochaine réunion aura lieu le 15 mars à 14h00.' },
      },
    ],
  },
];

async function seedSavedSession(
  userId: string,
  conversation: (typeof CONVERSATIONS)[number],
  daysAgo: number,
): Promise<string> {
  const startedAt = new Date(Date.now() - daysAgo * 86_400_000);
  const durationSeconds = 60 * randomInt(4, 40);

  const session = await prisma.session.create({
    data: {
      kind: conversation.kind,
      ownerUserId: userId,
      title: conversation.title,
      status: SessionStatus.ENDED,
      readingLanguage: conversation.readingLanguage,
      startedAt,
      endedAt: new Date(startedAt.getTime() + durationSeconds * 1000),
      durationSeconds,
      saveRequested: true,
      lastSequence: conversation.lines.length,
      slots:
        conversation.kind === SessionKind.PERSONAL_DISCUSS
          ? {
              create: conversation.languages.map((language, index) => ({
                position: index,
                readingLanguage: language,
                rotation: index === 0 ? 0 : 180,
              })),
            }
          : undefined,
    },
  });

  for (const [index, line] of conversation.lines.entries()) {
    const segment = await prisma.transcriptSegment.create({
      data: {
        sessionId: session.id,
        sequence: index + 1,
        sourceLanguage: line.language,
        originalTextEncrypted: await encrypt(line.text),
        characterCount: line.text.length,
        startedAtMs: index * 5000,
        endedAtMs: index * 5000 + 4000,
        createdAt: new Date(startedAt.getTime() + index * 5000),
      },
    });

    for (const [targetLanguage, translated] of Object.entries(line.translations)) {
      await prisma.translation.create({
        data: {
          segmentId: segment.id,
          targetLanguage,
          translatedTextEncrypted: await encrypt(translated),
          characterCount: translated.length,
          model: 'mock-translate',
          provider: 'mock',
        },
      });
    }
  }

  await prisma.usageLedger.createMany({
    data: [
      {
        userId,
        sessionId: session.id,
        metric: UsageMetric.AUDIO_SECONDS,
        quantity: durationSeconds,
        provider: 'mock',
        estimatedCostUsd: 0,
        createdAt: startedAt,
      },
      {
        userId,
        sessionId: session.id,
        metric: UsageMetric.SESSION_STARTED,
        quantity: 1,
        provider: 'mock',
        createdAt: startedAt,
      },
      {
        userId,
        sessionId: session.id,
        metric: UsageMetric.TRANSLATION_REQUESTS,
        quantity: conversation.lines.length,
        provider: 'mock',
        model: 'mock-translate',
        createdAt: startedAt,
      },
    ],
  });

  return session.id;
}

async function main(): Promise<void> {
  console.log('Seeding LingoLive development data…');

  // Idempotent: re-running the seed replaces the seeded rows rather than
  // stacking duplicates.
  await prisma.session.deleteMany({ where: { title: { in: CONVERSATIONS.map((c) => c.title) } } });
  await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, 'pro@lingolive.local'] } } });

  const admin = await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      displayName: 'LingoLive Operator',
      isGuest: false,
      isAdmin: true,
      preferredLocale: 'en',
      preferredReadingLanguage: 'en',
      onboardingCompleted: true,
      lastSeenAt: new Date(),
      entitlements: { create: { plan: Plan.PRO, source: 'MANUAL', active: true } },
    },
  });

  const pro = await prisma.user.create({
    data: {
      email: 'pro@lingolive.local',
      displayName: 'Amina',
      isGuest: false,
      preferredLocale: 'fr',
      preferredReadingLanguage: 'fr',
      onboardingCompleted: true,
      lastSeenAt: new Date(),
      entitlements: { create: { plan: Plan.PRO, source: 'STRIPE', active: true } },
      devices: {
        create: {
          anonymousIdHash: hashIdentifier('seed-device-pro'),
          platform: 'ios',
          appVersion: '1.0.0',
          locale: 'fr',
        },
      },
    },
  });

  const guest = await prisma.user.create({
    data: {
      isGuest: true,
      preferredLocale: 'pt-BR',
      preferredReadingLanguage: 'pt-BR',
      lastSeenAt: new Date(),
      entitlements: { create: { plan: Plan.GUEST, source: 'DEFAULT', active: true } },
      devices: {
        create: {
          anonymousIdHash: hashIdentifier('seed-device-guest'),
          platform: 'android',
          appVersion: '1.0.0',
          locale: 'pt-BR',
        },
      },
    },
  });

  await seedSavedSession(pro.id, CONVERSATIONS[0]!, 0);
  await seedSavedSession(pro.id, CONVERSATIONS[2]!, 3);
  await seedSavedSession(guest.id, CONVERSATIONS[1]!, 9);

  // A live LingoBusiness room, so the Join flow is testable immediately.
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const businessSession = await prisma.session.create({
    data: {
      kind: SessionKind.BUSINESS_BROADCAST,
      ownerUserId: admin.id,
      title: 'Conférence internationale 2026',
      organizerName: 'Example Organization',
      status: SessionStatus.LIVE,
      sourceLanguage: 'fr',
      readingLanguage: 'original',
      expiresAt: new Date(Date.now() + 24 * 3_600_000),
      slots: {
        create: ['en', 'ar', 'pt-BR', 'es'].map((language, index) => ({
          position: index,
          readingLanguage: language,
          rotation: 0,
        })),
      },
      accessCodes: {
        create: {
          codeHash: hashIdentifier(`business:${code}`),
          expiresAt: new Date(Date.now() + 24 * 3_600_000),
          maxParticipants: 5000,
        },
      },
    },
  });

  // A month of usage so the operator dashboard has a real shape.
  const usageRows = [];
  for (let day = 29; day >= 0; day--) {
    const at = new Date(Date.now() - day * 86_400_000);
    usageRows.push({
      userId: pro.id,
      metric: UsageMetric.AUDIO_SECONDS,
      quantity: randomInt(120, 1800),
      provider: 'mock',
      model: 'mock-transcribe',
      estimatedCostUsd: Number((Math.random() * 0.4).toFixed(4)),
      createdAt: at,
    });
    usageRows.push({
      userId: pro.id,
      metric: UsageMetric.TRANSLATION_REQUESTS,
      quantity: randomInt(5, 60),
      provider: 'mock',
      model: 'mock-translate',
      estimatedCostUsd: Number((Math.random() * 0.1).toFixed(4)),
      createdAt: at,
    });
  }
  await prisma.usageLedger.createMany({ data: usageRows });

  console.log(`
Seed complete.

  Admin account        ${ADMIN_EMAIL}
  Pro account          pro@lingolive.local
  Guest device         seeded (Android, pt-BR)
  Saved transcripts    3 (French, Arabic, Portuguese)

  LingoBusiness room   "${businessSession.title}"
  Join code            ${code}
  Join URL             ${process.env.WEB_BASE_URL ?? 'http://localhost:3000'}/join/${code}

  The code above is shown once and stored only as a hash — re-run
  \`pnpm db:seed\` to generate a new one.
`);
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
