/**
 * Base-URL normalisation.
 *
 * Deployment platforms hand out hostnames, not URLs. Render's `fromService`
 * with `property: host` resolves to a bare name — `lingolive-web-staging-n4cp`
 * — and every consumer of that value expects `https://…`:
 *
 *   - the API's configuration schema rejected it ("must use https://");
 *   - Next's `metadataBase: new URL(siteUrl)` threw `ERR_INVALID_URL` during
 *     the build, which surfaces as an unexplained "exited with status 1".
 *
 * Demanding a scheme is needless brittleness: a hostname is unambiguous, and
 * the only sane scheme outside a developer's machine is https. So both sides
 * normalise instead of rejecting, and the wiring works with no manual step.
 *
 * Lives in `contracts` because the server config and the web app both need it,
 * and they must agree — an origin that differs by a scheme is a CORS failure.
 */

/** Anything already carrying `scheme://`. */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/** Hosts that are, by definition, not reachable over TLS. */
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1)(:\d+)?$/i;

/**
 * `lingolive-web.onrender.com` → `https://lingolive-web.onrender.com`
 * `localhost:3000`            → `http://localhost:3000`
 * `https://example.com/`      → `https://example.com`
 *
 * An empty string stays empty: absent configuration is the caller's problem to
 * report, not something to paper over with a fabricated URL.
 */
export function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (HAS_SCHEME.test(trimmed)) return trimmed;

  const host = trimmed.split('/')[0] ?? trimmed;
  return `${LOCAL_HOST.test(host) ? 'http' : 'https'}://${trimmed}`;
}

/**
 * Normalises a list of allowed origins.
 *
 * A browser sends `Origin: https://host`, so an allow-list entry of `host`
 * would never match and every cross-origin request would be refused — a
 * failure that looks like a bug in the client. `*` is passed through so the
 * configuration layer can still reject it where it is not permitted.
 */
export function normalizeOrigins(values: readonly string[]): string[] {
  return values.map((value) => (value.trim() === '*' ? '*' : normalizeBaseUrl(value)));
}
