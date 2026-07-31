'use client';

import { useEffect, useState } from 'react';
import {
  findLanguage,
  normalizeAccessCode,
  type BusinessSessionPreview,
  type UiLocale,
} from '@lingolive/contracts';
import { SessionClient, TranscriptStore, type RenderedLine } from '@lingolive/realtime-core';
import { createTranslator } from '@lingolive/i18n';
import { createApiClient, getAnonymousId } from '@/lib/client';
import { Alert, Button, Card, LiveIndicator } from './ui';
import { Transcript } from './transcript';
import { LanguagePicker } from './language-picker';

/**
 * Joining a LingoBusiness session.
 *
 * Three ways in — a scanned QR code, a typed six-digit code, or a deep link —
 * all converge here. No account is required at any point, and this page works
 * in a browser with nothing installed, which is what makes a shared link
 * usable by a room full of strangers.
 */

type Stage = 'code' | 'language' | 'live' | 'ended';

const SUGGESTED = ['fr', 'en', 'ar', 'es', 'pt-BR'] as const;

export function JoinScreen({ locale, initialCode }: { locale: UiLocale; initialCode?: string }) {
  const t = createTranslator(locale);

  const [stage, setStage] = useState<Stage>('code');
  const [code, setCode] = useState(initialCode ? normalizeAccessCode(initialCode) : '');
  const [preview, setPreview] = useState<BusinessSessionPreview | null>(null);
  const [language, setLanguage] = useState<string>(locale);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<readonly RenderedLine[]>([]);
  const [participants, setParticipants] = useState(0);
  const [connection, setConnection] = useState('idle');
  const [store] = useState(() => new TranscriptStore());
  const [client, setClient] = useState<SessionClient | null>(null);

  // A deep link arrives with the code already in the URL: resolve it at once
  // rather than making the visitor retype what they just tapped.
  useEffect(() => {
    if (initialCode && normalizeAccessCode(initialCode).length === 6) {
      void lookup(normalizeAccessCode(initialCode));
    }
    // Intentionally runs once, for the initial deep link only.
  }, []);

  useEffect(() => () => client?.close(), [client]);

  async function lookup(value: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await createApiClient().previewBusinessSession(value);
      setPreview(response.session);
      setStage('language');
    } catch (caught) {
      setError(errorCodeOf(caught));
    } finally {
      setBusy(false);
    }
  }

  async function join(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await createApiClient().joinBusinessSession({
        code,
        targetLanguage: language,
        anonymousId: getAnonymousId(),
      });

      const session = new SessionClient({
        url: response.realtimeUrl,
        token: response.realtimeToken,
        socketFactory: (url) => new WebSocket(url) as never,
        onStatusChange: setConnection,
        onEvent: (event) => {
          switch (event.type) {
            case 'session.snapshot':
              store.hydrate(event.segments);
              setParticipants(event.participantCount);
              break;
            case 'transcript.final':
              store.applyFinal(event.segment);
              break;
            case 'transcript.partial':
              store.applyPartial({
                slotId: event.slotId,
                text: event.text,
                sourceLanguage: event.sourceLanguage,
                sequence: event.sequence,
              });
              break;
            case 'translation.final':
              store.applyTranslation(event.translation);
              break;
            case 'participant.count':
              setParticipants(event.count);
              break;
            case 'session.ended':
              setStage('ended');
              break;
            default:
              break;
          }
          setLines(store.render(language));
        },
      });
      session.connect();
      setClient(session);
      setStage('live');
    } catch (caught) {
      setError(errorCodeOf(caught));
    } finally {
      setBusy(false);
    }
  }

  // -- live ------------------------------------------------------------------

  if (stage === 'live' && preview) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-4">
        <header className="py-3">
          <h1 className="text-xl font-bold text-ink">{preview.title}</h1>
          <p className="text-[14px] text-ink-secondary">
            {t.t('join.organizedBy', { organizer: preview.organizerName })}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <LiveIndicator label={t.t('join.live')} />
            <span className="text-[14px] text-ink-muted">
              {t.t('join.participants', { count: participants })}
            </span>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              data-testid="viewer-language"
              className="ms-auto rounded-[var(--radius-full)] border border-border bg-surface px-4 py-2 text-[15px] text-ink"
            >
              {findLanguage(language)?.nativeName ?? language} ⌄
            </button>
          </div>
        </header>

        {connection === 'reconnecting' ? (
          <Alert tone="warning">{t.t('join.reconnecting')}</Alert>
        ) : null}

        <Transcript
          lines={lines}
          readingLanguage={language}
          emptyLabel={t.t('join.waitingForSpeaker')}
          backToLiveLabel={t.t('listen.backToLive')}
          liveRegionLabel={t.t('a11y.liveRegionLabel')}
        />

        <Button
          variant="secondary"
          className="mt-3"
          onClick={() => {
            client?.close();
            setStage('code');
          }}
        >
          {t.t('join.leave')}
        </Button>

        {pickerOpen ? (
          <LanguagePicker
            value={language}
            onChange={(next) => {
              setLanguage(next);
              client?.send({ type: 'language.set', language: next });
              setLines(store.render(next));
            }}
            onClose={() => setPickerOpen(false)}
            title={t.t('join.chooseLanguage')}
            searchPlaceholder={t.t('languagePicker.searchPlaceholder')}
            originalLabel={t.t('languagePicker.original')}
            originalHint={t.t('languagePicker.originalHint')}
            noResultsLabel={t.t('languagePicker.noResults')}
          />
        ) : null}
      </div>
    );
  }

  // -- ended -----------------------------------------------------------------

  if (stage === 'ended') {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4">
        <Card>
          <h1 className="text-2xl font-bold text-ink">{t.t('errors.sessionEnded')}</h1>
          <Button className="mt-6 w-full" onClick={() => setStage('code')}>
            {t.t('common.done')}
          </Button>
        </Card>
      </div>
    );
  }

  // -- choose language -------------------------------------------------------

  if (stage === 'language' && preview) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <Card>
          <h1 className="text-xl font-bold text-ink">{preview.title}</h1>
          <p className="text-[15px] text-ink-secondary">
            {t.t('join.organizedBy', { organizer: preview.organizerName })}
          </p>

          <h2 className="mt-6 text-[17px] font-semibold text-ink">{t.t('join.chooseLanguage')}</h2>
          <ul className="mt-3 space-y-2">
            {SUGGESTED.map((candidate) => (
              <li key={candidate}>
                <Button
                  variant={language === candidate ? 'primary' : 'secondary'}
                  className="w-full justify-start"
                  onClick={() => setLanguage(candidate)}
                  data-testid={`language-${candidate}`}
                >
                  {findLanguage(candidate)?.nativeName ?? candidate}
                </Button>
              </li>
            ))}
            <li>
              <Button variant="ghost" className="w-full" onClick={() => setPickerOpen(true)}>
                {t.t('onboarding.step2Other')}
              </Button>
            </li>
          </ul>

          {error ? <Alert tone="danger">{localisedError(t, error)}</Alert> : null}

          <Button
            className="mt-6 w-full"
            size="lg"
            disabled={busy}
            onClick={() => void join()}
            data-testid="confirm-join"
          >
            {busy ? t.t('join.joining') : t.t('join.title')}
          </Button>
          <p className="mt-3 text-center text-[13px] text-ink-muted">
            {t.t('join.noAccountNeeded')}
          </p>
        </Card>

        {pickerOpen ? (
          <LanguagePicker
            value={language}
            onChange={setLanguage}
            onClose={() => setPickerOpen(false)}
            title={t.t('join.chooseLanguage')}
            searchPlaceholder={t.t('languagePicker.searchPlaceholder')}
            originalLabel={t.t('languagePicker.original')}
            originalHint={t.t('languagePicker.originalHint')}
            noResultsLabel={t.t('languagePicker.noResults')}
          />
        ) : null}
      </div>
    );
  }

  // -- enter a code ----------------------------------------------------------

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
      <Card>
        <h1 className="text-2xl font-bold text-ink">{t.t('join.title')}</h1>
        <p className="mt-2 text-[15px] text-ink-secondary">{t.t('join.codeHelp')}</p>

        <label className="mt-6 block">
          <span className="mb-2 block text-[15px] font-medium text-ink">
            {t.t('join.enterCode')}
          </span>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(normalizeAccessCode(event.target.value))}
            placeholder={t.t('join.codePlaceholder')}
            data-testid="code-input"
            className="w-full rounded-[var(--radius-md)] border border-border bg-background px-4 py-4 text-center font-mono text-2xl tracking-[0.4em] text-ink"
          />
        </label>

        {error ? <Alert tone="danger">{localisedError(t, error)}</Alert> : null}

        <Button
          className="mt-5 w-full"
          size="lg"
          disabled={code.length !== 6 || busy}
          onClick={() => void lookup(code)}
          data-testid="lookup-code"
        >
          {busy ? t.t('common.loading') : t.t('common.continue')}
        </Button>

        <p className="mt-4 text-center text-[13px] text-ink-muted">
          {t.t('join.noAccountNeeded')} · {t.t('plans.joinAlwaysFree')}
        </p>
      </Card>
    </div>
  );
}

function errorCodeOf(error: unknown): string {
  return typeof error === 'object' && error && 'code' in error
    ? String((error as { code: unknown }).code)
    : 'INTERNAL_ERROR';
}

/** Error codes are mapped to localised copy — never shown raw to a user. */
function localisedError(t: ReturnType<typeof createTranslator>, code: string): string {
  switch (code) {
    case 'INVALID_ACCESS_CODE':
      return t.t('errors.invalidCode');
    case 'ACCESS_CODE_EXPIRED':
      return t.t('errors.codeExpired');
    case 'SESSION_ALREADY_ENDED':
      return t.t('errors.sessionEnded');
    case 'SESSION_FULL':
      return t.t('errors.sessionFull');
    case 'SERVICE_UNAVAILABLE':
      return t.t('errors.serverUnavailable');
    case 'RATE_LIMITED':
      return t.t('errors.generic');
    default:
      return t.t('errors.generic');
  }
}
