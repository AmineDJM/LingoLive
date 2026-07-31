'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker.
 *
 * Only in production and only over a secure origin — registering in
 * development produces stale-bundle bugs that are far more expensive than the
 * offline page is worth.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

    const register = (): void => {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // A failed registration must never break the app: everything works
        // without the service worker, it just loses the offline page.
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
