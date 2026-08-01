'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RenderedLine } from '@lingolive/realtime-core';
import {
  MockTranscriptionTransport,
  SessionClient,
  TranscriptStore,
  WebRtcTranscriptionTransport,
  initialContext,
  realtimeReducer,
  type RealtimeAction,
  type RealtimeContext,
} from '@lingolive/realtime-core';
import type {
  RealtimeTranscriptionTransport,
  ServerEvent,
  TranscriptionConfig,
  TranscriptionTokenResponse,
} from '@lingolive/contracts';
import { createBrowserTransportDependencies } from './browser-audio';
import { createApiClient, ensureToken } from './client';
import { errorCodeOf, errorReference as referenceFor } from './errors';

/**
 * The browser side of a live session.
 *
 * All the hard parts — the state machine, transcript ordering, reconnection,
 * the transport interface — live in `@lingolive/realtime-core` and are shared
 * with the mobile app and tested independently. This hook is the thin React
 * binding: it owns effects and re-renders, and nothing else.
 */

export interface UseLiveSessionOptions {
  kind: 'PERSONAL_LISTEN' | 'PERSONAL_DISCUSS';
  readingLanguage: string;
  slots?: Array<{ position: number; readingLanguage: string; rotation: 0 | 90 | 180 | 270 }>;
  /**
   * Whether the microphone opens as soon as the session connects.
   *
   * Listen says yes: nobody is holding a button. Discuss says no — it is
   * push-to-talk, and a tile that started capturing on load would be recording
   * the room before anyone chose to speak.
   */
  autoStartAudio?: boolean;
  spokenLanguage?: string;
}

export interface LiveSessionState {
  readonly context: RealtimeContext;
  readonly lines: readonly RenderedLine[];
  readonly sessionId: string | null;
  readonly elapsedSeconds: number;
  readonly participantCount: number;
  readonly errorCode: string | null;
  readonly errorReference: string | null;
  readonly connectionStatus: string;
  /**
   * True when the server has no transcription provider configured and the
   * transcript is coming from fixtures rather than a microphone.
   *
   * Exposed so the UI can say so. Scripted speech and real speech looked
   * identical on screen, which is how a deployment ran for a while looking
   * like it worked while transcribing nothing anyone said.
   */
  readonly isDemoTranscription: boolean;
  /**
   * True when silence released the microphone and the provider session.
   *
   * The LingoLive session, its transcript and its socket are all still alive —
   * only the expensive half is gone, and `resumeFromIdle` brings it back.
   */
  readonly autoPaused: boolean;
}

export function useLiveSession(options: UseLiveSessionOptions) {
  const [context, setContext] = useState<RealtimeContext>(initialContext);
  const [lines, setLines] = useState<readonly RenderedLine[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [elapsedSeconds, setElapsed] = useState(0);
  const [participantCount, setParticipantCount] = useState(0);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  // Kept alongside the code so the UI can show a reference someone can quote.
  const [errorReference, setErrorReference] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState('idle');
  const [isDemoTranscription, setDemoTranscription] = useState(false);
  const [autoPaused, setAutoPaused] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleSecondsRef = useRef(0);
  const [readingLanguage, setReadingLanguage] = useState(options.readingLanguage);
  const [renderTick, setRenderTick] = useState(0);

  const storeRef = useRef(new TranscriptStore());
  const clientRef = useRef<SessionClient | null>(null);
  const transportRef = useRef<RealtimeTranscriptionTransport | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const activeSlotRef = useRef<string | null>(null);

  const dispatch = useCallback((action: RealtimeAction) => {
    setContext((current) => realtimeReducer(current, action));
  }, []);

  const refreshLines = useCallback(() => {
    setLines(storeRef.current.render(readingLanguage));
    // Bumped on every event so a component rendering a DIFFERENT language —
    // a Discuss tile — re-renders too. Without it those tiles would only
    // update when the primary language happened to change.
    setRenderTick((tick) => tick + 1);
  }, [readingLanguage]);

  /**
   * The transcript rendered in one specific language.
   *
   * Discuss puts several languages on screen at once: each tile is a different
   * person reading the same conversation in their own. The hook's single
   * `lines` cannot express that — it renders one language, and Discuss asked
   * for `original`, so every tile showed untranslated text however many
   * translations arrived.
   */
  const linesFor = useCallback(
    (language: string): readonly RenderedLine[] => {
      void renderTick;
      return storeRef.current.render(language);
    },
    [renderTick],
  );

  // Re-render the transcript when the reader changes language, without
  // refetching anything: translations already received are reused.
  useEffect(() => {
    refreshLines();
  }, [refreshLines]);

  useEffect(() => {
    if (!startedAtRef.current) return;
    const timer = setInterval(() => {
      if (startedAtRef.current) {
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [context.state]);

  const handleServerEvent = useCallback(
    (event: ServerEvent) => {
      const store = storeRef.current;
      switch (event.type) {
        case 'session.snapshot':
          store.hydrate(event.segments);
          setParticipantCount(event.participantCount);
          break;
        case 'transcript.partial':
          store.applyPartial({
            slotId: event.slotId,
            text: event.text,
            sourceLanguage: event.sourceLanguage,
            sequence: event.sequence,
          });
          break;
        case 'transcript.final':
          store.applyFinal(event.segment);
          break;
        case 'translation.partial':
          store.applyPartialTranslation({
            sequence: event.sequence,
            targetLanguage: event.targetLanguage,
            text: event.text,
          });
          break;
        case 'translation.final':
          store.applyTranslation(event.translation);
          break;
        case 'participant.count':
          setParticipantCount(event.count);
          break;
        case 'session.ended':
          dispatch({ type: 'ENDED' });
          break;
        case 'error':
          setErrorCode(event.code);
          if (!event.retryable)
            dispatch({ type: 'ERROR', code: event.code, message: event.message, retryable: false });
          break;
        default:
          break;
      }
      refreshLines();
    },
    [dispatch, refreshLines],
  );

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  /**
   * Releases the microphone and the provider session after a stretch of silence.
   *
   * Audio is roughly 93% of what a session costs, and a device left on a table
   * between two conversations bills exactly like one being listened to. Muting
   * the track is not enough — a muted WebRTC track still holds the session open
   * — so the transport is torn down and the browser's recording indicator goes
   * out, which is also the honest signal that nothing is being heard.
   *
   * The LingoLive session, its transcript and its socket all survive. Only the
   * expensive half goes.
   */
  const releaseForIdle = useCallback(async () => {
    clearIdleTimer();
    const transport = transportRef.current;
    transportRef.current = null;
    setAutoPaused(true);
    dispatch({ type: 'PAUSED' });
    clientRef.current?.send({ type: 'session.pause' });
    await transport?.stopAudio();
    await transport?.disconnect();
  }, [clearIdleTimer, dispatch]);

  /** Restarts the idle countdown. Called on every sign of speech. */
  const noteSpeech = useCallback(() => {
    if (idleSecondsRef.current <= 0) return;
    clearIdleTimer();
    idleTimerRef.current = setTimeout(() => {
      void releaseForIdle();
    }, idleSecondsRef.current * 1000);
  }, [clearIdleTimer, releaseForIdle]);

  /**
   * Wires a transcription transport onto the live session and opens the mic.
   *
   * Shared by the initial start and by resuming from an idle pause, so the two
   * cannot drift — the resume path is the one nobody exercises by accident, and
   * a second copy of this is exactly where it would rot.
   */
  const attachTranscription = useCallback(
    async (tokenResponse: TranscriptionTokenResponse) => {
      const client = clientRef.current;
      if (!client) return;

      // The transport is chosen by the server, from whether a provider is
      // configured. The client does not decide this and must not: a build that
      // guessed would either ask for the microphone when there is nothing to
      // send it to, or play scripted speech on a deployment paying for a real
      // one.
      setDemoTranscription(tokenResponse.config.transport === 'mock');
      idleSecondsRef.current = tokenResponse.config.idleAutoPauseSeconds;

      const transport: RealtimeTranscriptionTransport =
        tokenResponse.config.transport === 'mock'
          ? new MockTranscriptionTransport({
              language: options.spokenLanguage === 'auto' ? undefined : options.spokenLanguage,
              loop: true,
            })
          : new WebRtcTranscriptionTransport(createBrowserTransportDependencies());

      transport.onError((transportError) => {
        setErrorCode(transportError.code);
        setErrorReference(referenceFor(transportError, transportError.code));
        dispatch({
          type: 'ERROR',
          code: transportError.code,
          message: transportError.message,
          retryable: transportError.retryable,
        });
      });
      transportRef.current = transport;

      transport.onPartial((partial) => {
        noteSpeech();
        client.send({
          type: 'transcript.partial',
          text: partial.text,
          ...(partial.sourceLanguage ? { sourceLanguage: partial.sourceLanguage } : {}),
          ...(activeSlotRef.current ? { slotId: activeSlotRef.current } : {}),
        });
      });
      transport.onFinal((final) => {
        noteSpeech();
        client.send({
          type: 'transcript.final',
          text: final.text,
          ...(final.sourceLanguage ? { sourceLanguage: final.sourceLanguage } : {}),
          ...(final.clientSegmentId ? { clientSegmentId: final.clientSegmentId } : {}),
          ...(activeSlotRef.current ? { slotId: activeSlotRef.current } : {}),
        });
      });

      await transport.connect(tokenResponse.config as TranscriptionConfig);

      if (options.autoStartAudio !== false) {
        await transport.startAudio();
        dispatch({ type: 'AUDIO_STARTED' });
        // Silence from the very beginning counts too: a session started and
        // then forgotten is exactly the case this exists for.
        noteSpeech();
      }
    },
    [dispatch, noteSpeech, options.autoStartAudio, options.spokenLanguage],
  );

  const start = useCallback(async () => {
    setErrorCode(null);
    setErrorReference(null);
    dispatch({ type: 'TOKEN_REQUESTED' });

    try {
      const api = createApiClient();
      await ensureToken();

      const created = await api.createSession({
        kind: options.kind,
        readingLanguage: options.readingLanguage,
        ...(options.slots ? { slots: options.slots } : {}),
      });
      setSessionId(created.session.id);

      const tokenResponse = await api.requestTranscriptionToken({
        sessionId: created.session.id,
        platform: 'web',
        preferredTransport: 'auto',
        spokenLanguage: options.spokenLanguage ?? 'auto',
        vocabularyHints: [],
      });

      dispatch({ type: 'TOKEN_RECEIVED' });

      const client = new SessionClient({
        url: tokenResponse.realtimeUrl,
        token: tokenResponse.realtimeToken,
        socketFactory: (url) => new WebSocket(url) as never,
        onEvent: handleServerEvent,
        onStatusChange: (status) => {
          setConnectionStatus(status);
          if (status === 'connected') dispatch({ type: 'CONNECTED' });
          if (status === 'reconnecting') dispatch({ type: 'CONNECTION_LOST' });
          if (status === 'failed') {
            dispatch({
              type: 'ERROR',
              code: 'REALTIME_CONNECTION_FAILED',
              message: 'Could not reconnect',
              retryable: true,
            });
          }
        },
      });
      clientRef.current = client;
      client.connect();

      startedAtRef.current = Date.now();

      // The transport is chosen by the server, from whether a provider is
      // configured. In mock mode it is an in-process fixture, so the entire
      // experience runs with no provider account and no microphone prompt —
      // which is what the test suite and the offline demo rely on.
      //
      // The client does not decide this and must not: a build that guessed
      // would either ask for the microphone when there is nothing to send it
      // to, or play scripted speech on a deployment paying for a real one.
      await attachTranscription(tokenResponse);
    } catch (error) {
      const code = errorCodeOf(error);
      setErrorCode(code);
      setErrorReference(referenceFor(error, code));
      dispatch({ type: 'ERROR', code, message: 'Could not start the session', retryable: true });
    }
  }, [
    attachTranscription,
    dispatch,
    handleServerEvent,
    options.kind,
    options.readingLanguage,
    options.autoStartAudio,
    options.slots,
    options.spokenLanguage,
  ]);

  /**
   * Brings the microphone back after an idle pause.
   *
   * A fresh credential, because the one the session started with is long
   * expired by design — they last about a minute. The LingoLive session and its
   * transcript are untouched, so this continues the same conversation rather
   * than starting another one.
   */
  const resumeFromIdle = useCallback(async () => {
    if (!sessionId) return;
    setErrorCode(null);
    setErrorReference(null);
    try {
      const tokenResponse = await createApiClient().requestTranscriptionToken({
        sessionId,
        platform: 'web',
        preferredTransport: 'auto',
        spokenLanguage: options.spokenLanguage ?? 'auto',
        vocabularyHints: [],
      });
      setAutoPaused(false);
      clientRef.current?.send({ type: 'session.resume' });
      await attachTranscription(tokenResponse);
    } catch (error) {
      const code = errorCodeOf(error);
      setErrorCode(code);
      setErrorReference(referenceFor(error, code));
    }
  }, [attachTranscription, options.spokenLanguage, sessionId]);

  const pause = useCallback(async () => {
    clearIdleTimer();
    await transportRef.current?.pause();
    clientRef.current?.send({ type: 'session.pause' });
    dispatch({ type: 'PAUSED' });
  }, [dispatch]);

  const resume = useCallback(async () => {
    await transportRef.current?.resume();
    clientRef.current?.send({ type: 'session.resume' });
    dispatch({ type: 'RESUMED' });
  }, [dispatch]);

  const end = useCallback(async () => {
    clearIdleTimer();
    dispatch({ type: 'END_REQUESTED' });
    await transportRef.current?.stopAudio();
    await transportRef.current?.disconnect();
    clientRef.current?.send({ type: 'session.end' });
    clientRef.current?.close();
    dispatch({ type: 'ENDED' });
  }, [clearIdleTimer, dispatch]);

  const startSpeaking = useCallback((slotId: string) => {
    activeSlotRef.current = slotId;
    clientRef.current?.send({ type: 'speaker.start', slotId });
    void transportRef.current?.resume();
  }, []);

  const stopSpeaking = useCallback((slotId: string) => {
    clientRef.current?.send({ type: 'speaker.stop', slotId });
    void transportRef.current?.pause();
    activeSlotRef.current = null;
  }, []);

  const changeLanguage = useCallback((language: string) => {
    setReadingLanguage(language);
    clientRef.current?.send({ type: 'language.set', language });
  }, []);

  // Always tear the session down on unmount: a forgotten socket is a ghost
  // stream, and a ghost stream is a bill.
  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      void transportRef.current?.disconnect();
      clientRef.current?.close();
    };
  }, []);

  const state = useMemo<LiveSessionState>(
    () => ({
      context,
      lines,
      sessionId,
      elapsedSeconds,
      participantCount,
      errorCode,
      errorReference,
      connectionStatus,
      isDemoTranscription,
      autoPaused,
    }),
    [
      context,
      lines,
      sessionId,
      elapsedSeconds,
      participantCount,
      errorCode,
      errorReference,
      connectionStatus,
      isDemoTranscription,
      autoPaused,
    ],
  );

  return {
    ...state,
    readingLanguage,
    linesFor,
    start,
    pause,
    resume,
    resumeFromIdle,
    end,
    startSpeaking,
    stopSpeaking,
    changeLanguage,
  };
}
