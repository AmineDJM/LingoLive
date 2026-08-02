import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * The small set of primitives every screen is built from.
 *
 * They exist so that no page reaches for a raw colour or radius: everything
 * routes through the design tokens, which is what keeps light/dark, RTL and
 * the contrast guarantees consistent across the whole product.
 */

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'md' | 'lg';

/*
 * `ll-pressable` gives every button the same press: a 3% scale that answers the
 * finger immediately and eases back. It is the one piece of motion in the
 * product that fires constantly, so it is deliberately below the threshold of
 * something you would call an animation — you notice its absence, not its
 * presence. Reduce Motion removes it (see globals.css).
 */
const BUTTON_BASE =
  'll-pressable inline-flex items-center justify-center gap-2 rounded-[var(--radius-full)] ' +
  'font-semibold tracking-[var(--tracking-label)] ' +
  'disabled:opacity-45 disabled:cursor-not-allowed disabled:shadow-none select-none';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  // A filled button carries its own small shadow so it reads as a physical
  // control on the surface rather than a coloured rectangle painted on it.
  primary:
    'bg-primary text-on-primary shadow-[var(--shadow-card)] hover:bg-primary-hover active:shadow-[var(--shadow-pressed)]',
  secondary:
    'bg-surface text-ink border border-border shadow-[var(--shadow-card)] hover:border-border-strong active:shadow-[var(--shadow-pressed)]',
  ghost: 'bg-transparent text-primary-text hover:bg-primary-soft',
  danger: 'bg-danger-soft text-danger hover:brightness-95',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  md: 'px-5 py-3 text-body-small',
  lg: 'px-7 py-4 text-body',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      type="button"
      className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  children,
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} & Omit<React.ComponentProps<typeof Link>, 'href' | 'className'>) {
  return (
    <Link
      href={href}
      className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...props}
    >
      {children}
    </Link>
  );
}

export function Card({
  children,
  className,
  as: Component = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'li';
}) {
  return (
    <Component
      className={cx(
        'rounded-[var(--radius-xl)] border border-border bg-surface p-6',
        'shadow-[var(--shadow-card)]',
        className,
      )}
    >
      {children}
    </Component>
  );
}

/**
 * The Live indicator.
 *
 * Never colour alone: the pulsing dot is always accompanied by the word
 * "LIVE" and an accessible label, because a red dot means nothing to someone
 * who cannot distinguish it.
 */
export function LiveIndicator({ label, paused = false }: { label: string; paused?: boolean }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-2 rounded-[var(--radius-full)] px-3 py-1.5 text-sm font-bold tracking-wide',
        paused ? 'bg-surface text-ink-secondary' : 'bg-live-soft text-live-text',
      )}
      role="status"
    >
      <span
        aria-hidden="true"
        className={cx(
          'inline-block h-2.5 w-2.5 rounded-full',
          paused ? 'bg-ink-muted' : 'bg-live ll-live-dot',
        )}
      />
      {label}
    </span>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'live' | 'warning' | 'danger';
}) {
  const tones = {
    neutral: 'bg-primary-soft text-primary-text',
    live: 'bg-live-soft text-live-text',
    warning:
      'bg-[color-mix(in_srgb,var(--color-warning)_15%,transparent)] text-[var(--color-warning)]',
    danger: 'bg-danger-soft text-danger',
  } as const;
  return (
    <span
      className={cx(
        'inline-block rounded-[var(--radius-full)] px-2.5 py-1 text-xs font-semibold',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function PageHeading({
  eyebrow,
  title,
  intro,
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
}) {
  return (
    <header className="mx-auto max-w-3xl text-center">
      {eyebrow ? (
        <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-primary-text">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="text-balance text-4xl font-bold leading-tight text-ink sm:text-5xl">
        {title}
      </h1>
      {intro ? (
        <p className="mt-5 text-pretty text-lg leading-relaxed text-ink-secondary">{intro}</p>
      ) : null}
    </header>
  );
}

export function Prose({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-3xl space-y-10">{children}</div>;
}

export function Section({ heading, body }: { heading: string; body: string }) {
  return (
    <section>
      <h2 className="text-2xl font-bold text-ink">{heading}</h2>
      <p className="mt-3 text-pretty text-body leading-relaxed text-ink-secondary">{body}</p>
    </section>
  );
}

export function Alert({
  tone = 'info',
  title,
  children,
  testId,
}: {
  tone?: 'info' | 'warning' | 'danger';
  title?: string;
  children: ReactNode;
  /** Overrides the shared `alert` hook when a test needs to find one specific alert. */
  testId?: string;
}) {
  const tones = {
    info: 'border-border bg-primary-soft text-ink',
    warning: 'border-[var(--color-warning)] bg-surface text-ink',
    danger: 'border-danger bg-danger-soft text-ink',
  } as const;
  return (
    <div
      role={tone === 'info' ? 'note' : 'alert'}
      data-testid={testId ?? 'alert'}
      className={cx(
        'rounded-[var(--radius-md)] border p-4 text-body-small leading-relaxed',
        tones[tone],
      )}
    >
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      {children}
    </div>
  );
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return (
    <span className="absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0,0,0,0)]">
      {children}
    </span>
  );
}
