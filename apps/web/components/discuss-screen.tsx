'use client';

import { useMemo, useState } from 'react';
import { findLanguage, type DiscussParticipantCount, type UiLocale } from '@lingolive/contracts';
import {
  canSpeak,
  createDiscussionState,
  layoutPlacements,
  rotateTile,
  setTileLanguage,
  startSpeaking as startSpeakingIn,
  stopSpeaking as stopSpeakingIn,
  targetLanguagesForTurn,
  tileTransform,
  type DiscussionState,
  type DiscussionTile,
} from '@lingolive/realtime-core';
import { createTranslator } from '@lingolive/i18n';
import { useLiveSession } from '@/lib/use-live-session';
import { Button, Card, cx, LiveIndicator } from './ui';
import { LanguagePicker } from './language-picker';

/**
 * Discuss mode.
 *
 * A device lying flat on a table with two to four people around it. All the
 * layout and turn-taking logic lives in `@lingolive/realtime-core`, shared
 * with mobile and covered by its own tests; this component is the surface.
 */
export function DiscussScreen({ locale }: { locale: UiLocale }) {
  const t = createTranslator(locale);
  const [count, setCount] = useState<DiscussParticipantCount | null>(null);
  const [discussion, setDiscussion] = useState<DiscussionState | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  const slots = useMemo(
    () =>
      discussion?.tiles.map((tile) => ({
        position: tile.position,
        readingLanguage: tile.readingLanguage,
        rotation: tile.rotation,
      })) ?? [],
    [discussion],
  );

  const session = useLiveSession({
    kind: 'PERSONAL_DISCUSS',
    readingLanguage: 'original',
    slots,
    // Audio is driven by the per-tile push-to-talk buttons, not on mount.
    simulate: false,
  });

  const begin = (people: DiscussParticipantCount): void => {
    setCount(people);
    // The user's own locale first; English then fills the remaining tiles,
    // which each person can change with one tap.
    setDiscussion(createDiscussionState(people, [locale, 'en', 'ar', 'pt-BR']));
  };

  // -- how many people -------------------------------------------------------

  if (!discussion || !count) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <Card>
          <h1 className="text-2xl font-bold text-ink">{t.t('discuss.howManyPeople')}</h1>
          <div className="mt-6 grid grid-cols-3 gap-3">
            {([2, 3, 4] as const).map((people) => (
              <button
                key={people}
                type="button"
                onClick={() => begin(people)}
                data-testid={`people-${people}`}
                className="flex aspect-square flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border-2 border-border bg-surface text-3xl font-bold text-ink hover:border-primary"
              >
                <SeatingDiagram count={people} />
                {people}
              </button>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  const placements = layoutPlacements(discussion);

  const onSpeakStart = (tile: DiscussionTile): void => {
    if (!canSpeak(discussion, tile.id)) return;
    setDiscussion(startSpeakingIn(discussion, tile.id));
    if (!session.sessionId) {
      void session.start().then(() => session.startSpeaking(tile.id));
    } else {
      session.startSpeaking(tile.id);
    }
  };

  const onSpeakEnd = (tile: DiscussionTile): void => {
    setDiscussion(stopSpeakingIn(discussion, tile.id));
    session.stopSpeaking(tile.id);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col p-3">
      <header className="flex items-center gap-3 pb-3">
        <LiveIndicator
          label={session.context.state === 'listening' ? t.t('listen.live') : t.t('discuss.title')}
          paused={session.context.state !== 'listening'}
        />
        <span className="ms-auto text-[14px] text-ink-muted" data-testid="translation-count">
          {t.t('discuss.peopleCount', { count })}
        </span>
        <Button variant="secondary" onClick={() => void session.end()} data-testid="end-discussion">
          {t.t('discuss.endDiscussion')}
        </Button>
      </header>

      {/*
        A 2×2 grid backs every layout. Two people occupy full-width halves,
        three use one full row plus two cells, four use one cell each — which
        matches how people actually sit around a table.
      */}
      <div
        className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-3"
        data-testid="discussion-canvas"
      >
        {discussion.tiles.map((tile) => {
          const placement = placements.find((entry) => entry.tileId === tile.id);
          const active = discussion.activeSpeakerTileId === tile.id;
          const blocked = !canSpeak(discussion, tile.id);
          const languageName =
            findLanguage(tile.readingLanguage)?.nativeName ?? tile.readingLanguage;
          const tileLines = session.lines;

          return (
            <section
              key={tile.id}
              data-testid={`tile-${tile.position}`}
              data-rotation={tile.rotation}
              data-direction={tile.direction}
              aria-label={t.t('discuss.slotLabel', { position: tile.position + 1 })}
              style={{
                gridColumn: `${placement?.column ?? 1} / span ${placement?.columnSpan ?? 1}`,
                gridRow: `${placement?.row ?? 1} / span ${placement?.rowSpan ?? 1}`,
                ['--ll-tile-rotation' as string]: `${tile.rotation}deg`,
              }}
              data-quarter-turn={tileTransform(tile).isQuarterTurn}
              className={cx(
                'll-tile min-h-0 rounded-[var(--radius-lg)] border-2',
                active ? 'border-live bg-live-soft' : 'border-border bg-surface',
              )}
              dir={tile.direction}
            >
              <div className="ll-tile-content flex flex-col p-3">
                <div className="flex items-center gap-2 pb-2">
                  <button
                    type="button"
                    onClick={() => setPickerFor(tile.id)}
                    data-testid={`tile-language-${tile.position}`}
                    aria-label={t.t('a11y.languageButton', { language: languageName })}
                    className="truncate rounded-[var(--radius-full)] border border-border px-3 py-1.5 text-[13px] font-semibold text-ink"
                  >
                    {languageName}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscussion(rotateTile(discussion, tile.id))}
                    data-testid={`tile-rotate-${tile.position}`}
                    aria-label={t.t('a11y.rotateButton', { language: languageName })}
                    className="ms-auto rounded-[var(--radius-full)] border border-border px-3 py-1.5 text-[15px] text-ink"
                  >
                    ↻
                  </button>
                </div>

                <ol className="min-h-0 flex-1 overflow-y-auto text-[15px] leading-snug">
                  {tileLines.length === 0 ? (
                    <li className="py-4 text-center text-ink-muted">
                      {t.t('discuss.waitingForOthers')}
                    </li>
                  ) : (
                    tileLines.slice(-3).map((line) => (
                      <li
                        key={line.id}
                        className={cx(
                          'py-1',
                          line.isFinal ? 'text-transcript-final' : 'text-transcript-partial',
                        )}
                      >
                        {line.text}
                      </li>
                    ))
                  )}
                </ol>

                <button
                  type="button"
                  disabled={blocked}
                  onPointerDown={() => onSpeakStart(tile)}
                  onPointerUp={() => onSpeakEnd(tile)}
                  onPointerLeave={() => active && onSpeakEnd(tile)}
                  data-testid={`tile-speak-${tile.position}`}
                  aria-label={t.t('a11y.speakButton', { language: languageName })}
                  aria-pressed={active}
                  className={cx(
                    'mt-2 flex w-full items-center justify-center rounded-[var(--radius-md)] py-4 text-[15px] font-bold',
                    active
                      ? 'bg-live text-on-primary'
                      : blocked
                        ? 'bg-surface text-ink-muted'
                        : 'bg-primary text-on-primary',
                  )}
                >
                  {active
                    ? t.t('discuss.speaking')
                    : blocked
                      ? t.t('discuss.someoneElseSpeaking')
                      : t.t('discuss.speak')}
                </button>
              </div>
            </section>
          );
        })}
      </div>

      <p className="pt-2 text-center text-[13px] text-ink-muted">
        {t.t('discuss.tapToSpeak')} ·{' '}
        {/* Made visible because it is the product's central cost property. */}
        {targetLanguagesForTurn(discussion, discussion.tiles[0]!.id).length}{' '}
        {t.t('discuss.translating')}
      </p>

      {pickerFor ? (
        <LanguagePicker
          value={discussion.tiles.find((tile) => tile.id === pickerFor)?.readingLanguage ?? 'en'}
          allowOriginal={false}
          onChange={(language) => setDiscussion(setTileLanguage(discussion, pickerFor, language))}
          onClose={() => setPickerFor(null)}
          title={t.t('languagePicker.title')}
          searchPlaceholder={t.t('languagePicker.searchPlaceholder')}
          originalLabel={t.t('languagePicker.original')}
          originalHint={t.t('languagePicker.originalHint')}
          noResultsLabel={t.t('languagePicker.noResults')}
        />
      ) : null}
    </div>
  );
}

/** A small geometric hint at where people sit — no illustration, no stock art. */
function SeatingDiagram({ count }: { count: 2 | 3 | 4 }) {
  const seats: Record<number, Array<[number, number]>> = {
    2: [
      [16, 5],
      [16, 27],
    ],
    3: [
      [16, 5],
      [5, 27],
      [27, 27],
    ],
    4: [
      [16, 5],
      [5, 16],
      [27, 16],
      [16, 27],
    ],
  };
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="9" y="9" width="14" height="14" rx="3" fill="var(--color-primary-soft)" />
      {seats[count]?.map(([cx_, cy]) => (
        <circle key={`${cx_}-${cy}`} cx={cx_} cy={cy} r="3.2" fill="var(--color-primary)" />
      ))}
    </svg>
  );
}
