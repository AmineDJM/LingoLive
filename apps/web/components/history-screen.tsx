'use client';

import { useEffect, useState } from 'react';
import type { SessionSummary, UiLocale } from '@lingolive/contracts';
import { createTranslator } from '@lingolive/i18n';
import { createApiClient } from '@/lib/client';
import { Alert, Badge, Button, Card } from './ui';

/**
 * History.
 *
 * Only sessions the user explicitly saved appear here — that is the whole
 * privacy model made visible. Grouped by recency rather than folders, because
 * "the meeting this morning" is how people actually look for a transcript.
 */
export function HistoryScreen({ locale }: { locale: UiLocale }) {
  const t = createTranslator(locale);
  const [items, setItems] = useState<SessionSummary[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await createApiClient().history({ limit: 50 });
        if (!cancelled) setItems(response.items);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const remove = async (id: string): Promise<void> => {
    await createApiClient().deleteSession(id);
    setItems((current) => current.filter((item) => item.id !== id));
  };

  const filtered = query
    ? items.filter(
        (item) =>
          (item.title ?? '').toLowerCase().includes(query.toLowerCase()) ||
          item.preview.toLowerCase().includes(query.toLowerCase()),
      )
    : items;

  const groups = groupByRecency(filtered);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-8">
      <h1 className="text-2xl font-bold text-ink">{t.t('history.title')}</h1>

      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t.t('history.searchPlaceholder')}
        aria-label={t.t('history.searchPlaceholder')}
        className="mt-4 w-full rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3 text-[16px] text-ink"
      />

      {error ? <Alert tone="danger">{t.t('errors.serverUnavailable')}</Alert> : null}

      {loading ? (
        <p className="py-12 text-center text-ink-muted">{t.t('common.loading')}</p>
      ) : filtered.length === 0 ? (
        <Card className="mt-6 text-center">
          <p className="text-[17px] font-medium text-ink">
            {query ? t.t('history.noResults', { query }) : t.t('history.empty')}
          </p>
          {!query ? (
            <p className="mt-2 text-[15px] text-ink-secondary">{t.t('history.emptyBody')}</p>
          ) : null}
        </Card>
      ) : (
        <div className="mt-6 space-y-8">
          {groups.map((group) => (
            <section key={group.key}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-muted">
                {t.t(group.labelKey)}
              </h2>
              <ul className="space-y-3">
                {group.items.map((item) => (
                  <Card as="li" key={item.id}>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-[17px] font-semibold text-ink">
                          {item.title ?? t.t(kindLabel(item.kind))}
                        </h3>
                        <p className="mt-0.5 text-[13px] text-ink-muted">
                          {t.t('history.itemSubtitle', {
                            duration: t.formatDuration(item.durationSeconds),
                            languages: item.languages.join(', ') || '—',
                          })}
                        </p>
                      </div>
                      <Badge>{t.t(kindLabel(item.kind))}</Badge>
                    </div>
                    <p className="mt-2 line-clamp-2 text-[15px] leading-relaxed text-ink-secondary">
                      {item.preview}
                    </p>
                    <Button
                      variant="danger"
                      className="mt-3"
                      onClick={() => void remove(item.id)}
                      data-testid={`delete-${item.id}`}
                    >
                      {t.t('common.delete')}
                    </Button>
                  </Card>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function kindLabel(
  kind: string,
): 'history.kindListen' | 'history.kindDiscuss' | 'history.kindBusiness' {
  if (kind === 'PERSONAL_DISCUSS') return 'history.kindDiscuss';
  if (kind === 'BUSINESS_BROADCAST') return 'history.kindBusiness';
  return 'history.kindListen';
}

type Group = {
  key: string;
  labelKey: 'history.today' | 'history.thisWeek' | 'history.older';
  items: SessionSummary[];
};

/** Today / this week / older — computed client-side from the timestamps. */
function groupByRecency(items: SessionSummary[]): Group[] {
  const now = Date.now();
  const dayMs = 86_400_000;
  const groups: Group[] = [
    { key: 'today', labelKey: 'history.today', items: [] },
    { key: 'week', labelKey: 'history.thisWeek', items: [] },
    { key: 'older', labelKey: 'history.older', items: [] },
  ];

  for (const item of items) {
    const age = now - new Date(item.startedAt).getTime();
    if (age < dayMs) groups[0]!.items.push(item);
    else if (age < 7 * dayMs) groups[1]!.items.push(item);
    else groups[2]!.items.push(item);
  }

  return groups.filter((group) => group.items.length > 0);
}
