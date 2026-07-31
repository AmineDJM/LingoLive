import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import type { RenderedLine } from '@lingolive/realtime-core';
import {
  MockTranscriptionTransport,
  SessionClient,
  TranscriptStore,
  initialContext,
  realtimeReducer,
  type RealtimeAction,
  type RealtimeContext,
} from '@lingolive/realtime-core';
import type { ServerEvent, TranscriptionConfig } from '@lingolive/contracts';
import { createApiClient } from '@/services/api';

/**
 * The mobile side of a live session.
 *
 * Identical in shape to the web hook, and for the same reason: the state
 * machine, transcript store, reconnection and transport interface all live in
 * `@lingolive/realtime-core`, so both platforms cannot diverge.
 *
 * Two behaviours are mobile-specific and important:
 *  - the screen is kept awake for the duration of a session;
 *  - capture suspends when the app leaves the foreground. LingoLive
 *    deliberately does not record in the background (ADR 0007, §31.3).
 */

export interface UseSessionOptions {
  kind: 'PERSONAL_LISTEN' | 'PERSONAL_DISCUSS';
  readingLanguage: string;
  slots?: Array<{ position: number; readingLanguage: string; rotation: 0 | 90 | 180 | 270 }>;
  autoStartAudio?: boolean;
}

export function useSession(options: UseSessionOptions) {
  useKeepAwake();

  const [context, setContext] = useState<RealtimeContext>(initialContext);
  const [lines, setLines] = useState<readonly RenderedLine[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [elapsedSeconds, setElapsed] = useState(0);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState('idle');
  const [readingLanguage, setReadingLanguage] = useState(options.readingLanguage);

  const storeRef = useRef(new TranscriptStore());
  const clientRef = useRef<SessionClient | null>(null);
  const transportRef = useRef<MockTranscriptionTransport | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const activeSlotRef = useRef<string | null>(null);

  const dispatch = useCallback((action: RealtimeAction) => {
    setContext((current) => realtimeReducer(current, action));
  }, []);

  const refresh = useCallback(() => {
    setLines(storeRef.current.render(readingLanguage));
  }, [readingLanguage]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (startedAtRef.current) setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Leaving the foreground suspends capture. The session stays open briefly so
  // a glance at a notification does not destroy the transcript.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && context.state === 'listening') {
        void transportRef.current?.pause();
        clientRef.current?.send({ type: 'session.pause' });
        dispatch({ type: 'PAUSED' });
      }
    });
    return () => subscription.remove();
  }, [context.state, dispatch]);

  const onEvent = useCallback(
    (event: ServerEvent) => {
      const store = storeRef.current;
      switch (event.type) {
        case 'session.snapshot':
          store.hydrate(event.segments);
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
        case 'session.ended':
          dispatch({ type: 'ENDED' });
          break;
        case 'error':
          setErrorCode(event.code);
          break;
        default:
          break;
      }
      refresh();
    },
    [dispatch, refresh],
  );

  const start = useCallback(async () => {
    setErrorCode(null);
    dispatch({ type: 'TOKEN_REQUESTED' });
    try {
      const api = createApiClient();
      const created = await api.createSession({
        kind: options.kind,
        readingLanguage: options.readingLanguage,
        ...(options.slots ? { slots: options.slots } : {}),
      });
      setSessionId(created.session.id);

      const token = await api.requestTranscriptionToken({
        sessionId: created.session.id,
        platform: 'ios',
        preferredTransport: 'websocket',
        spokenLanguage: 'auto',
        vocabularyHints: [],
      });
      dispatch({ type: 'TOKEN_RECEIVED' });

      const client = new SessionClient({
        url: token.realtimeUrl,
        token: token.realtimeToken,
        socketFactory: (url) => new WebSocket(url) as never,
        onEvent,
        onStatusChange: (status) => {
          setConnectionStatus(status);
          if (status === 'connected') dispatch({ type: 'CONNECTED' });
          if (status === 'reconnecting') dispatch({ type: 'CONNECTION_LOST' });
        },
      });
      clientRef.current = client;
      client.connect();
      startedAtRef.current = Date.now();

      const transport = new MockTranscriptionTransport({ loop: true });
      transportRef.current = transport;
      transport.onPartial((partial) =>
        client.send({
          type: 'transcript.partial',
          text: partial.text,
          ...(partial.sourceLanguage ? { sourceLanguage: partial.sourceLanguage } : {}),
          ...(activeSlotRef.current ? { slotId: activeSlotRef.current } : {}),
        }),
      );
      transport.onFinal((final) =>
        client.send({
          type: 'transcript.final',
          text: final.text,
          ...(final.sourceLanguage ? { sourceLanguage: final.sourceLanguage } : {}),
          ...(final.clientSegmentId ? { clientSegmentId: final.clientSegmentId } : {}),
          ...(activeSlotRef.current ? { slotId: activeSlotRef.current } : {}),
        }),
      );
      await transport.connect(token.config as TranscriptionConfig);

      if (options.autoStartAudio !== false) {
        await transport.startAudio();
        dispatch({ type: 'AUDIO_STARTED' });
      }
    } catch (error) {
      const code =
        typeof error === 'object' && error && 'code' in error
          ? String((error as { code: unknown }).code)
          : 'INTERNAL_ERROR';
      setErrorCode(code);
      dispatch({ type: 'ERROR', code, message: 'Could not start', retryable: true });
    }
  }, [
    dispatch,
    onEvent,
    options.autoStartAudio,
    options.kind,
    options.readingLanguage,
    options.slots,
  ]);

  const pause = useCallback(async () => {
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
    dispatch({ type: 'END_REQUESTED' });
    await transportRef.current?.stopAudio();
    await transportRef.current?.disconnect();
    clientRef.current?.send({ type: 'session.end' });
    clientRef.current?.close();
    dispatch({ type: 'ENDED' });
  }, [dispatch]);

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

  // Tearing the session down on unmount is not optional: a leaked socket is a
  // stream nobody is reading and a bill nobody expected.
  useEffect(
    () => () => {
      void transportRef.current?.disconnect();
      clientRef.current?.close();
    },
    [],
  );

  return useMemo(
    () => ({
      context,
      lines,
      sessionId,
      elapsedSeconds,
      errorCode,
      connectionStatus,
      readingLanguage,
      start,
      pause,
      resume,
      end,
      startSpeaking,
      stopSpeaking,
      changeLanguage,
    }),
    [
      context,
      lines,
      sessionId,
      elapsedSeconds,
      errorCode,
      connectionStatus,
      readingLanguage,
      start,
      pause,
      resume,
      end,
      startSpeaking,
      stopSpeaking,
      changeLanguage,
    ],
  );
}
