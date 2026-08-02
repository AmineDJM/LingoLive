import Link from 'next/link';

/**
 * A 404 that helps rather than apologises: it offers the three things anyone
 * arriving at a broken LingoLive link was probably trying to do.
 */
export default function NotFound() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 px-6 text-center"
    >
      <p className="font-mono text-sm text-ink-muted">404</p>
      <h1 className="text-3xl font-bold text-ink">This page does not exist</h1>
      <p className="text-body leading-relaxed text-ink-secondary">
        The link may be out of date. Here is where most people are heading.
      </p>
      <ul className="w-full space-y-3">
        {[
          { href: '/en/listen', label: 'Listen' },
          { href: '/en/discuss', label: 'Discuss' },
          { href: '/en/join', label: 'Join a session' },
          { href: '/en', label: 'Home' },
        ].map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="flex min-h-12 w-full items-center justify-center rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3 font-medium text-ink hover:border-border-strong"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
