import type { MetadataRoute } from 'next';
import { siteName } from '@/lib/site';

/**
 * PWA manifest.
 *
 * `start_url` points at the English app home; the middleware immediately
 * redirects an installed launch to the visitor's locale, so a user who
 * installed from `/fr` still lands in French.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LingoLive — Live Translation',
    short_name: siteName,
    description: 'Understand every conversation, live. Live transcription and translation.',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#F5F7FB',
    theme_color: '#2F6BFF',
    categories: ['productivity', 'utilities', 'education'],
    lang: 'en',
    dir: 'auto',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Listen', url: '/en/listen', description: 'Start a live transcription' },
      { name: 'Discuss', url: '/en/discuss', description: 'Talk with two to four people' },
      { name: 'Join', url: '/en/join', description: 'Join a session with a code' },
    ],
  };
}
