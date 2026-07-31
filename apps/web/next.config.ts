import type { NextConfig } from 'next';
import { normalizeBaseUrl } from '@lingolive/contracts';

/**
 * Security headers.
 *
 * The CSP is deliberately strict: this application asks people for microphone
 * access, so a script-injection foothold would be unusually damaging.
 * `connect-src` is widened at build time to the configured API origin because
 * the browser talks to it over both HTTPS and WSS.
 */
// Same normalisation as lib/site.ts: a bare hostname from the platform must
// become an origin, or the CSP's connect-src silently blocks every API call.
const apiUrl = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000');
const appEnv = process.env.NEXT_PUBLIC_APP_ENV ?? 'development';

/**
 * `NEXT_PUBLIC_*` values are inlined into the JavaScript at BUILD time.
 *
 * Setting one in a dashboard after the fact changes nothing: the bundle in the
 * browser still holds whatever was present when it was compiled. A deployment
 * that builds before those variables are set ships a client hard-wired to
 * `http://localhost:4000`, and every call from a real browser fails — which
 * surfaces to the user as an unexplained error on the first tap, with a
 * perfectly healthy API sitting right there.
 *
 * So the build refuses. Failing here costs a rebuild; shipping costs someone
 * an afternoon wondering why nothing works.
 */
if (appEnv !== 'development' && appEnv !== 'test') {
  const problems = [];
  if (/localhost|127\.0\.0\.1/.test(apiUrl)) {
    problems.push(`NEXT_PUBLIC_API_URL points at ${apiUrl}`);
  }
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
const apiWs = apiUrl.replace(/^http/, 'ws');
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
  `connect-src 'self' ${apiUrl} ${apiWs}`,
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

export default nextConfig;
