import { NextResponse, type NextRequest } from 'next/server';
import { LOCALE_URL_SEGMENTS, resolveLocale } from '@lingolive/contracts';

/**
 * Locale routing.
 *
 * Every public URL carries its locale as the first path segment (`/fr`,
 * `/pt-br`, …). A request without one is redirected to the visitor's best
 * match — the alternative, serving all seven languages from one URL, would
 * make them indistinguishable to a search engine and unshareable between
 * people who read different languages.
 */

const PUBLIC_FILE = /\.[a-z0-9]+$/i;
// `/offline` is deliberately locale-free: the service worker serves it when
// the network is gone, and a redirect at that moment would fail.
const EXEMPT_PREFIXES = [
  '/_next',
  '/api',
  '/icons',
  '/offline',
  '/sw.js',
  '/manifest.webmanifest',
  '/robots.txt',
  '/sitemap.xml',
];

export default function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix)) || PUBLIC_FILE.test(pathname)) {
    return NextResponse.next();
  }

  const [, first] = pathname.split('/');
  if (first && LOCALE_URL_SEGMENTS.includes(first.toLowerCase())) {
    return NextResponse.next();
  }

  // Cookie beats Accept-Language: an explicit choice must survive.
  const preferred = request.cookies.get('lingolive.locale')?.value;
  const locale = resolveLocale(preferred ?? request.headers.get('accept-language'));
  const segment = locale.toLowerCase();

  const url = request.nextUrl.clone();
  url.pathname = `/${segment}${pathname === '/' ? '' : pathname}`;
  // 307, not 308: the best locale for a visitor can legitimately change.
  return NextResponse.redirect(url, 307);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
