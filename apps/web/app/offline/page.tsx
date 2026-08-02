import type { Metadata } from 'next';

/**
 * The offline fallback served by the service worker.
 *
 * It states plainly that live transcription needs a connection rather than
 * pretending to work — this product cannot transcribe offline, and implying
 * otherwise would be the worst possible moment to mislead someone.
 */
export const metadata: Metadata = {
  title: 'Offline — LingoLive',
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <h1 className="text-2xl font-bold text-ink">You are offline</h1>
      <p className="text-body leading-relaxed text-ink-secondary">
        Live transcription needs an internet connection.
      </p>
      <a
        href="/"
        className="mt-2 inline-flex min-h-12 items-center rounded-[var(--radius-md)] bg-primary px-6 py-3 font-semibold text-on-primary"
      >
        Try again
      </a>
    </main>
  );
}
