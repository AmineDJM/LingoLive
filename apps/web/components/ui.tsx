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

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] font-semibold ' +
  'transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed select-none';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'bg-surface text-ink border border-border hover:border-border-strong',
  ghost: 'bg-transparent text-primary-text hover:bg-primary-soft',
  danger: 'bg-danger-soft text-danger hover:brightness-95',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  md: 'px-4 py-3 text-[15px]',
  lg: 'px-6 py-4 text-[17px]',
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
        'rounded-[var(--radius-lg)] border border-border bg-surface p-6',
        'shadow-[var(--ll-shadow-card)]',
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
      <p className="mt-3 text-pretty text-[17px] leading-relaxed text-ink-secondary">{body}</p>
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
        'rounded-[var(--radius-md)] border p-4 text-[15px] leading-relaxed',
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
