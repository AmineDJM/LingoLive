'use client';

import { useMemo, useState } from 'react';
import { ORIGINAL_LANGUAGE, searchLanguages, type LanguageDefinition } from '@lingolive/contracts';
import { cx } from './ui';

/**
 * Language picker.
 *
 * Endonyms only, never flags. Search is accent-insensitive, so "espanol"
 * finds "Español" — typing diacritics on an unfamiliar keyboard is exactly
 * the situation this product exists for.
 */
export function LanguagePicker({
  value,
  onChange,
  onClose,
  title,
  searchPlaceholder,
  originalLabel,
  originalHint,
  noResultsLabel,
  allowOriginal = true,
  recent = [],
  recentLabel,
}: {
  value: string;
  onChange: (language: string) => void;
  onClose: () => void;
  title: string;
  searchPlaceholder: string;
  originalLabel: string;
  originalHint: string;
  noResultsLabel: string;
  allowOriginal?: boolean;
  recent?: readonly string[];
  recentLabel?: string;
}) {
  const [query, setQuery] = useState('');
  const results = useMemo<LanguageDefinition[]>(() => searchLanguages(query, 60), [query]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--ll-color-overlay)] sm:items-center"
      onClick={onClose}
    >
      <div
        className="ll-material-sheet max-h-[85dvh] w-full max-w-md overflow-hidden rounded-t-[var(--radius-xl)] bg-surface shadow-[var(--shadow-raised)] sm:rounded-[var(--radius-xl)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-border p-4">
          <h2 className="mb-3 text-lg font-bold text-ink">{title}</h2>
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="w-full rounded-[var(--radius-md)] border border-border bg-background px-4 py-3 text-[16px] text-ink"
          />
        </div>

        <ul className="max-h-[55dvh] overflow-y-auto p-2">
          {allowOriginal ? (
            <li>
              <LanguageRow
                selected={value === ORIGINAL_LANGUAGE}
                label={originalLabel}
                hint={originalHint}
                onSelect={() => {
                  onChange(ORIGINAL_LANGUAGE);
                  onClose();
                }}
              />
            </li>
          ) : null}

          {recent.length > 0 && query === '' && recentLabel ? (
            <li className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">
              {recentLabel}
            </li>
          ) : null}

          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-ink-muted">{noResultsLabel}</li>
          ) : (
            results.map((language) => (
              <li key={language.code}>
                <LanguageRow
                  selected={value.toLowerCase() === language.code.toLowerCase()}
                  label={language.nativeName}
                  hint={language.englishName}
                  dir={language.direction}
                  lang={language.code}
                  onSelect={() => {
                    onChange(language.code);
                    onClose();
                  }}
                />
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

function LanguageRow({
  selected,
  label,
  hint,
  dir,
  lang,
  onSelect,
}: {
  selected: boolean;
  label: string;
  hint: string;
  dir?: 'ltr' | 'rtl';
  lang?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={cx(
        'flex w-full flex-col items-start gap-0.5 rounded-[var(--radius-md)] px-3 py-3 text-start',
        selected ? 'bg-primary-soft' : 'hover:bg-primary-soft',
      )}
    >
      <span className="text-[16px] font-medium text-ink" dir={dir} lang={lang}>
        {label}
      </span>
      <span className="text-[13px] text-ink-muted">{hint}</span>
    </button>
  );
}
