'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { findLanguage, ORIGINAL_LANGUAGE, type UiLocale } from '@lingolive/contracts';
import { createTranslator } from '@lingolive/i18n';
import { createApiClient, checkMicrophoneAvailability } from '@/lib/client';
import { useLiveSession } from '@/lib/use-live-session';
import { localizedPath } from '@/lib/site';
import { Alert, Button, Card, LiveIndicator, VisuallyHidden } from './ui';
import { Transcript } from './transcript';
import { LanguagePicker } from './language-picker';
import { localisedError } from '@/lib/errors';

/**
 * Listen mode.
 *
 * One screen, one job: show what is being said. Everything not needed while
 * reading — settings, history, marketing navigation — is deliberately absent.
 */
export function ListenScreen({ locale }: { locale: UiLocale }) {
  const t = createTranslator(locale);
  const router = useRouter();

  const [readingLanguage, setLocalLanguage] = useState<string>(locale);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [micIssue, setMicIssue] = useState<'insecure-context' | 'unsupported' | null>(null);

  const session = useLiveSession({ kind: 'PERSONAL_LISTEN', readingLanguage });

  useEffect(() => {
    const availability = checkMicrophoneAvailability();
    if (!availability.available) setMicIssue(availability.reason);
  }, []);

  const state = session.context.state;
  const isLive = state === 'listening';
  const isPaused = state === 'paused';
  const hasEnded = state === 'ended';

  const languageLabel =
    readingLanguage === ORIGINAL_LANGUAGE
      ? t.t('languagePicker.original')
      : (findLanguage(readingLanguage)?.nativeName ?? readingLanguage);

  const changeLanguage = (language: string): void => {
    setLocalLanguage(language);
    session.changeLanguage(language);
  };

  const save = async (): Promise<void> => {
    if (!session.sessionId) return;
    await createApiClient().saveSession(session.sessionId, { confirmed: true });
    setSaved(true);
  };

  const discard = async (): Promise<void> => {
    if (session.sessionId) {
      await createApiClient().deleteSession(session.sessionId);
    }
    router.push(localizedPath(locale));
  };

  // -- ended -----------------------------------------------------------------

  if (hasEnded) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <Card>
          <h1 className="text-2xl font-bold text-ink">{t.t('listen.endedTitle')}</h1>
          <p className="mt-2 text-body text-ink-secondary">
            {t.t('listen.endedDuration', { duration: t.formatDuration(session.elapsedSeconds) })}
          </p>
          <p className="mt-1 text-body-small text-ink-muted">{t.t('listen.audioNotStored')}</p>

          <div className="mt-6 space-y-3">
            {saved ? (
              <Alert tone="info">{t.t('listen.savedToast')}</Alert>
            ) : (
              <Button
                className="w-full"
                size="lg"
                onClick={() => void save()}
                data-testid="save-transcript"
              >
                {t.t('listen.saveTranscript')}
              </Button>
            )}
            <Button
              className="w-full"
              variant="danger"
              onClick={() => void discard()}
              data-testid="discard-transcript"
            >
              {t.t('listen.discardTranscript')}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // -- idle ------------------------------------------------------------------

  if (state === 'idle' || state === 'error') {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <Card>
          <h1 className="text-2xl font-bold text-ink">{t.t('home.listenTitle')}</h1>
          <p className="mt-2 text-body leading-relaxed text-ink-secondary">
            {t.t('home.listenSubtitle')}
          </p>

          {micIssue ? (
            <Alert tone="warning" title={t.t('errors.micUnavailable')}>
              {micIssue === 'insecure-context'
                ? t.t('errors.insecureContext')
                : t.t('errors.unsupportedBrowser')}
            </Alert>
          ) : null}

          {session.errorCode ? (
            <Alert tone="danger" title={t.t('errors.generic')}>
              {localisedError(t, session.errorCode)}
              {session.errorReference ? (
                <span
                  className="mt-2 block text-caption text-ink-muted"
                  data-testid="error-reference"
                >
                  {t.t('errors.referenceId', { requestId: session.errorReference })}
                </span>
              ) : null}
            </Alert>
          ) : null}

          <p className="mt-6 text-body-small text-ink-muted">{t.t('listen.audioNotStored')}</p>

          <Button
            className="mt-4 w-full"
            size="lg"
            onClick={() => void session.start()}
            data-testid="start-listening"
          >
            {t.t('home.listenTitle')}
          </Button>
        </Card>
      </div>
    );
  }

  // -- live ------------------------------------------------------------------

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-4">
      <header className="flex items-center gap-3 py-3">
        <LiveIndicator
          label={isPaused ? t.t('listen.paused') : t.t('listen.live')}
          paused={isPaused}
        />
        <span
          className="font-mono text-body-small tabular-nums text-ink-secondary"
          data-testid="session-timer"
        >
          <VisuallyHidden>
            {t.t('a11y.sessionTimer', { duration: t.formatClock(session.elapsedSeconds) })}
          </VisuallyHidden>
          <span aria-hidden="true">{t.formatClock(session.elapsedSeconds)}</span>
        </span>

        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          data-testid="language-chip"
          aria-label={t.t('a11y.languageButton', { language: languageLabel })}
          className="ms-auto rounded-[var(--radius-full)] border border-border bg-surface px-4 py-2 text-body-small font-medium text-ink"
        >
          {languageLabel} ⌄
        </button>
      </header>

      {session.isDemoTranscription ? (
        <Alert tone="warning" title={t.t('listen.demoMode')} testId="demo-mode">
          {t.t('listen.demoModeDetail')}
        </Alert>
      ) : null}

      {session.autoPaused ? (
        <Alert tone="info" title={t.t('listen.idlePaused')} testId="idle-paused">
          {t.t('listen.idlePausedDetail')}
          <Button
            className="mt-3"
            onClick={() => void session.resumeFromIdle()}
            data-testid="resume-from-idle"
          >
            {t.t('listen.idleResume')}
          </Button>
        </Alert>
      ) : null}

      {session.connectionStatus === 'reconnecting' ? (
        <Alert tone="warning">{t.t('errors.network')}</Alert>
      ) : null}

      {/*
        A live session could fail silently. Translation degrades to showing the
        original text when the provider refuses it, which is the right
        behaviour — but with no error surface here, someone reading in French
        just kept seeing English with nothing to explain it, and it looked like
        the product simply not translating.
      */}
      {session.errorCode ? (
        <Alert tone="warning" testId="live-error">
          {localisedError(t, session.errorCode)}
          {session.errorReference ? (
            <span
              className="mt-2 block text-caption text-ink-muted"
              data-testid="live-error-reference"
            >
              {t.t('errors.referenceId', { requestId: session.errorReference })}
            </span>
          ) : null}
        </Alert>
      ) : null}

      <Transcript
        lines={session.lines}
        readingLanguage={readingLanguage}
        emptyLabel={t.t('listen.waitingForSpeech')}
        backToLiveLabel={t.t('listen.backToLive')}
        liveRegionLabel={t.t('a11y.liveRegionLabel')}
      />

      <div className="flex gap-3 pt-3">
        <Button
          className="flex-1"
          size="lg"
          variant="secondary"
          onClick={() => void (isPaused ? session.resume() : session.pause())}
          data-testid="toggle-pause"
        >
          {isPaused ? t.t('listen.resume') : t.t('listen.pause')}
        </Button>
        <Button
          className="flex-1"
          size="lg"
          onClick={() => void session.end()}
          data-testid="end-session"
        >
          {t.t('listen.end')}
        </Button>
      </div>

      <p className="pt-2 text-center text-caption text-ink-muted">
        {isLive ? t.t('listen.micIndicator') : t.t('listen.audioNotStored')}
      </p>

      {pickerOpen ? (
        <LanguagePicker
          value={readingLanguage}
          onChange={changeLanguage}
          onClose={() => setPickerOpen(false)}
          title={t.t('languagePicker.title')}
          searchPlaceholder={t.t('languagePicker.searchPlaceholder')}
          originalLabel={t.t('languagePicker.original')}
          originalHint={t.t('languagePicker.originalHint')}
          noResultsLabel={t.t('languagePicker.noResults')}
          recentLabel={t.t('languagePicker.recent')}
        />
      ) : null}
    </div>
  );
}
