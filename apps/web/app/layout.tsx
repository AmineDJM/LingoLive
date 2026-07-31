import type { Metadata, Viewport } from 'next';
import { themeStyleSheet, THEME_BOOTSTRAP_SCRIPT } from '@/lib/theme';
import { siteName, siteTagline, siteUrl } from '@/lib/site';
import { ServiceWorkerRegistration } from '@/components/service-worker';
import './globals.css';

/**
 * Root document.
 *
 * `lang` and `dir` are set by the locale layout below this one; the root
 * defaults to English so that a request that never reaches a locale route
 * (a 404, the offline page) is still valid HTML.
 */
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: siteTagline, template: `%s` },
  applicationName: siteName,
  formatDetection: { telephone: false },
  appleWebApp: {
    capable: true,
    title: siteName,
    statusBarStyle: 'default',
  },
  icons: {
    icon: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Never block pinch-zoom: it is an accessibility requirement, and this
  // product is used by people who need to enlarge text.
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F5F7FB' },
    { media: '(prefers-color-scheme: dark)', color: '#07111F' },
  ],
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <style
          // Tokens must exist before the first paint.
          dangerouslySetInnerHTML={{ __html: themeStyleSheet() }}
        />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
