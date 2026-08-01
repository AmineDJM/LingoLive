import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_BUILD } from 'next/constants.js';
import { normalizeBaseUrl } from '@lingolive/contracts';

/**
 * Security headers.
 *
 * The CSP is deliberately strict: this application asks people for microphone
 * access, so a script-injection foothold would be unusually damaging.
 * `connect-src` is 'self' for HTTP, because those calls go through the proxy
 * below, plus the WebSocket origin, which cannot be proxied.
 */
/**
 * Where this server forwards `/api/*`.
 *
 * Read at server START, not at build time, because it is not a `NEXT_PUBLIC_*`
 * value — so pointing the site at a different API is a restart, not a rebuild.
 */
const apiOrigin = normalizeBaseUrl(
  process.env.API_ORIGIN ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
);

const appEnv = process.env.NEXT_PUBLIC_APP_ENV ?? 'development';

const isRealDeployment = appEnv !== 'development' && appEnv !== 'test';

// The browser never calls the API directly, so a proxy target left pointing at
// localhost in a real deployment means every request dies at this server. It
// cannot throw — `next start` re-reads this file and refusing here would stop
// a running site — so it says so loudly in the log instead.
if (isRealDeployment && /localhost|127\.0\.0\.1/.test(apiOrigin)) {
  console.warn(
    `\n[LingoLive] API_ORIGIN is ${apiOrigin} but this is a ${appEnv} deployment.\n` +
      '           Every API call will fail. Set API_ORIGIN to the API service URL.\n',
  );
}

/**
 * API_ORIGIN must be the API's PUBLIC address, not a platform-internal name.
 *
 * It is used for two things that must agree: this server proxies `/api/*` to
 * it, and the `connect-src` below is derived from it. The realtime WebSocket is
 * the one connection a rewrite cannot proxy, so the browser dials the API
 * directly — at the public address the API itself advertises, built from its
 * `API_BASE_URL`.
 *
 * Wiring this to a platform's service reference yields a bare internal name
 * like `lingolive-api-staging-n4cp`, with no domain. HTTP still worked, so it
 * looked correct; `connect-src` then listed an origin nobody ever dials, and
 * the browser blocked the socket. `new WebSocket()` throws a `SecurityError`
 * for that, which surfaced as an unexplained failure on the first tap of
 * Listen with nothing in the server log — because the server was never reached.
 *
 * A public hostname has a dot in it. An internal one does not.
 */
const apiHostname = apiOrigin.replace(/^[a-z]+:\/\//i, '').split(/[:/]/)[0] ?? '';
if (isRealDeployment && apiHostname && !apiHostname.includes('.')) {
  console.warn(
    `\n[LingoLive] API_ORIGIN is "${apiHostname}", which is not a public hostname.\n` +
      '           The realtime connection will be blocked by the Content-Security-Policy.\n' +
      "           Set API_ORIGIN to the same value as the API service's API_BASE_URL.\n",
  );
}

/**
 * `NEXT_PUBLIC_*` values are inlined into the JavaScript at BUILD time.
 *
 * Setting one in a dashboard afterwards changes nothing: the bundle in the
 * browser still holds whatever was present when it was compiled. A deployment
 * that builds before those variables are set ships a client that cannot work,
 * and the user sees an unexplained error on the first tap.
 *
 * This runs on the BUILD phase only. `next start` re-evaluates this file, and
 * the build-time variables are not necessarily in the runtime environment —
 * throwing there would stop a perfectly good server from booting. (It did,
 * once, which is how this acquired a phase check.)
 */
function assertBuildTimeConfig(phase: string): void {
  if (phase !== PHASE_PRODUCTION_BUILD) return;
  if (appEnv === 'development' || appEnv === 'test') return;

  const problems: string[] = [];
  if (/localhost|127\.0\.0\.1/.test(process.env.NEXT_PUBLIC_SITE_URL ?? 'localhost')) {
    problems.push('NEXT_PUBLIC_SITE_URL points at localhost or is unset');
  }
  if (problems.length > 0) {
    throw new Error(
      `This build is for NEXT_PUBLIC_APP_ENV=${appEnv}, but:\n` +
        problems.map((problem) => `  - ${problem}`).join('\n') +
        '\n\nThese are baked into the browser bundle at build time. Set them on the\n' +
        'service, then build again — changing them without rebuilding has no effect.',
    );
  }
}
const apiWs = apiOrigin.replace(/^http/, 'ws');
const isDev = process.env.NODE_ENV !== 'production';

const csp = [
  "default-src 'self'",
  // Next.js inlines a small bootstrap script; `strict-dynamic` is not usable
  // with the App Router's streaming output, so inline is scoped as tightly as
  // the framework allows.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // 'self' covers every HTTP call: they all go through the proxy below. The
  // only other origin is the WebSocket, which a rewrite cannot proxy.
  `connect-src 'self' ${apiWs}`,
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Permissions-Policy',
    // The product needs exactly two capabilities. Everything else is denied,
    // including for embedded content.
    value: 'microphone=(self), camera=(self), geolocation=(), payment=(), usb=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains; preload',
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // One build worker instead of one per core.
    //
    // Prerendering 7 locales × 17 marketing pages plus the app routes runs a
    // worker per CPU by default, and each holds its own copy of the i18n
    // corpus and the React renderer. On a small build instance that is how a
    // deploy dies with an unexplained "exited with status 1" and a log that
    // simply stops mid-line.
    //
    // Serial prerendering costs about a minute of build time and takes a
    // meaningful bite out of peak memory. Build time is not the constraint
    // here; fitting in the instance is.
    cpus: 1,
  },
  // Workspace packages ship dual ESM/CJS; transpiling keeps tree-shaking
  // effective and avoids a dual-package hazard in the client bundle.
  transpilePackages: [
    '@lingolive/contracts',
    '@lingolive/design-tokens',
    '@lingolive/i18n',
    '@lingolive/realtime-core',
    '@lingolive/api-client',
  ],
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        // The service worker must never be cached, or an update can never ship.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
  /**
   * Everything under /api is forwarded to the real API by this server.
   *
   * The browser therefore only ever calls the origin it was loaded from: no
   * CORS preflight to get wrong, no API address compiled into the bundle, no
   * mixed-content or connect-src mismatch. Those were three separate ways the
   * first deployment failed, and this removes all of them.
   */
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
  },
  async redirects() {
    return [
      // A bare code path is a common thing to type or paste.
      { source: '/join', destination: '/en/join', permanent: false },
      { source: '/join/:code', destination: '/en/join/:code', permanent: false },
      { source: '/listen', destination: '/en/listen', permanent: false },
      { source: '/discuss', destination: '/en/discuss', permanent: false },
    ];
  },
};

export default (phase: string): NextConfig => {
  assertBuildTimeConfig(phase);
  return nextConfig;
};
