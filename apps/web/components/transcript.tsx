'use client';

import { useEffect, useRef, useState } from 'react';
import type { RenderedLine } from '@lingolive/realtime-core';
import { isRtlLanguage } from '@lingolive/contracts';
import { cx } from './ui';

/**
 * The live transcript.
 *
 * Three behaviours matter more than anything visual here:
 *  - final text replaces its partial in place, never stacking;
 *  - scrolling follows the live edge only while the reader is already at the
 *    bottom — the moment they scroll back to re-read something, it stops
 *    chasing them and offers a way to return;
 *  - the screen-reader live region announces completed lines only.
 */
export function Transcript({
  lines,
  readingLanguage,
  emptyLabel,
  backToLiveLabel,
  liveRegionLabel,
}: {
  lines: readonly RenderedLine[];
  readingLanguage: string;
  emptyLabel: string;
  backToLiveLabel: string;
  liveRegionLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !pinnedToBottom) return;
    container.scrollTop = container.scrollHeight;
  }, [lines, pinnedToBottom]);

  const onScroll = (): void => {
    const container = containerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    // A small tolerance: momentum scrolling rarely lands exactly at zero.
    setPinnedToBottom(distanceFromBottom < 48);
  };

  const scrollToLive = (): void => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    setPinnedToBottom(true);
  };

  const finalLines = lines.filter((line) => line.isFinal);
  const dir = isRtlLanguage(readingLanguage) ? 'rtl' : 'ltr';

  return (
    <div className="relative flex-1">
      <div
        ref={containerRef}
        onScroll={onScroll}
        dir={dir}
        className="ll-transcript h-full overflow-y-auto px-1 py-4"
        data-testid="transcript"
      >
        {lines.length === 0 ? (
          <p className="py-12 text-center text-[17px] text-ink-muted">{emptyLabel}</p>
        ) : (
          <ol className="space-y-5">
            {lines.map((line) => (
              <li
                key={line.id}
                data-final={line.isFinal}
                data-testid={line.isFinal ? 'segment-final' : 'segment-partial'}
                className={cx(
                  'll-segment-enter text-pretty',
                  line.isFinal ? 'text-transcript-final' : 'text-transcript-partial',
                )}
                lang={line.isOriginal ? (line.sourceLanguage ?? undefined) : readingLanguage}
              >
                {line.text}
                {line.isTranslationPending ? (
                  <span className="ms-2 align-middle text-[0.6em] text-ink-muted">…</span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>

      {/*
        Only completed lines are announced, and only the most recent one, so a
        screen reader stays usable during a fast transcript instead of reading
        every partial word.
      */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-label={liveRegionLabel}
        className="sr-only"
      >
        {finalLines.at(-1)?.text ?? ''}
      </div>

      {!pinnedToBottom ? (
        <button
          type="button"
          onClick={scrollToLive}
          data-testid="back-to-live"
          className="absolute bottom-4 start-1/2 -translate-x-1/2 rounded-[var(--radius-full)] bg-primary px-5 py-3 text-[15px] font-semibold text-on-primary shadow-[var(--shadow-raised)]"
        >
          ↓ {backToLiveLabel}
        </button>
      ) : null}
    </div>
  );
}
