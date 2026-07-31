import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  findLanguage,
  normalizeAccessCode,
  type BusinessSessionPreview,
} from '@lingolive/contracts';
import {
  parseJoinLink,
  SessionClient,
  TranscriptStore,
  type RenderedLine,
} from '@lingolive/realtime-core';
import { fontSize, MIN_TOUCH_TARGET, radius, spacing } from '@lingolive/design-tokens';
import { useApp } from '@/hooks/use-app';
import { createApiClient, deepLinkScheme, getAnonymousId, webBaseUrl } from '@/services/api';
import { Body, Button, Card, Heading, LiveBadge, Screen } from '@/components/ui';
import { TranscriptView } from '@/components/transcript-view';
import { LanguageSheet } from '@/components/language-sheet';

/**
 * Joining a LingoBusiness session.
 *
 * Three entry points, one screen: scan a QR code, type a six-digit code, or
 * arrive from a deep link. No account is required at any stage.
 */
type Stage = 'entry' | 'scanning' | 'language' | 'live' | 'ended';

const SUGGESTED = ['fr', 'en', 'ar', 'es', 'pt-BR'] as const;

export default function JoinScreen() {
  const { t, theme, preferences, haptic } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ code?: string }>();
  const [cameraPermission, requestCamera] = useCameraPermissions();

  const [stage, setStage] = useState<Stage>('entry');
  const [code, setCode] = useState(params.code ? normalizeAccessCode(params.code) : '');
  const [preview, setPreview] = useState<BusinessSessionPreview | null>(null);
  const [language, setLanguage] = useState(preferences.readingLanguage);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<readonly RenderedLine[]>([]);
  const [connection, setConnection] = useState('idle');
  const [store] = useState(() => new TranscriptStore());
  const [client, setClient] = useState<SessionClient | null>(null);

  // Deep links: both `lingolive://join/728416` and the https universal link
  // land here, already carrying the code.
  useEffect(() => {
    const handle = (url: string | null): void => {
      if (!url) return;
      const parsed = parseJoinLink(url, { scheme: deepLinkScheme, webBaseUrl });
      if (parsed?.code) {
        setCode(parsed.code);
        void lookup(parsed.code);
      }
      if (parsed?.language) setLanguage(parsed.language);
    };

    void Linking.getInitialURL().then(handle);
    const subscription = Linking.addEventListener('url', (event) => handle(event.url));

    if (params.code && normalizeAccessCode(params.code).length === 6) {
      void lookup(normalizeAccessCode(params.code));
    }
    return () => subscription.remove();
    // Runs once: subsequent codes arrive through the listener.
  }, []);

  useEffect(() => () => client?.close(), [client]);

  async function lookup(value: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await createApiClient().previewBusinessSession(value);
      setPreview(response.session);
      setStage('language');
      haptic('success');
    } catch (caught) {
      setError(codeOf(caught));
      haptic('warning');
    } finally {
      setBusy(false);
    }
  }

  async function join(): Promise<void> {
    setBusy(true);
    try {
      const response = await createApiClient().joinBusinessSession({
        code,
        targetLanguage: language,
        anonymousId: await getAnonymousId(),
      });
      const session = new SessionClient({
        url: response.realtimeUrl,
        token: response.realtimeToken,
        socketFactory: (url) => new WebSocket(url) as never,
        onStatusChange: setConnection,
        onEvent: (event) => {
          if (event.type === 'session.snapshot') store.hydrate(event.segments);
          else if (event.type === 'transcript.final') store.applyFinal(event.segment);
          else if (event.type === 'transcript.partial') {
            store.applyPartial({
              slotId: event.slotId,
              text: event.text,
              sourceLanguage: event.sourceLanguage,
              sequence: event.sequence,
            });
          } else if (event.type === 'translation.final') store.applyTranslation(event.translation);
          else if (event.type === 'session.ended') setStage('ended');
          setLines(store.render(language));
        },
      });
      session.connect();
      setClient(session);
      setStage('live');
    } catch (caught) {
      setError(codeOf(caught));
    } finally {
      setBusy(false);
    }
  }

  if (stage === 'live' && preview) {
    return (
      <Screen padded={false} style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View style={{ padding: spacing.base }}>
          <Heading level={2}>{preview.title}</Heading>
          <Body muted>{t.t('join.organizedBy', { organizer: preview.organizerName })}</Body>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              marginTop: spacing.sm,
            }}
          >
            <LiveBadge label={t.t('join.live')} />
            <View style={{ flex: 1 }} />
            <Button
              label={`${findLanguage(language)?.nativeName ?? language} ⌄`}
              variant="secondary"
              testID="viewer-language"
              onPress={() => setSheetOpen(true)}
            />
          </View>
          {connection === 'reconnecting' ? (
            <Body style={{ marginTop: spacing.sm, color: theme.warning }}>
              {t.t('join.reconnecting')}
            </Body>
          ) : null}
        </View>

        <View style={{ flex: 1, paddingHorizontal: spacing.base }}>
          <TranscriptView
            lines={lines}
            readingLanguage={language}
            emptyLabel={t.t('join.waitingForSpeaker')}
            backToLiveLabel={t.t('listen.backToLive')}
            liveRegionLabel={t.t('a11y.liveRegionLabel')}
          />
        </View>

        <Button
          label={t.t('join.leave')}
          variant="secondary"
          style={{ margin: spacing.base }}
          onPress={() => {
            client?.close();
            router.back();
          }}
        />

        {sheetOpen ? (
          <LanguageSheet
            value={language}
            onChange={(next) => {
              setLanguage(next);
              client?.send({ type: 'language.set', language: next });
              setLines(store.render(next));
            }}
            onClose={() => setSheetOpen(false)}
          />
        ) : null}
      </Screen>
    );
  }

  if (stage === 'ended') {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <Card>
          <Heading level={1}>{t.t('errors.sessionEnded')}</Heading>
          <Button
            label={t.t('common.done')}
            style={{ marginTop: spacing.lg }}
            onPress={() => router.back()}
          />
        </Card>
      </Screen>
    );
  }

  if (stage === 'scanning') {
    return (
      <Screen padded={false}>
        <CameraView
          style={{ flex: 1 }}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            const parsed = parseJoinLink(data, { scheme: deepLinkScheme, webBaseUrl });
            if (!parsed?.code) return;
            setStage('entry');
            setCode(parsed.code);
            void lookup(parsed.code);
          }}
        />
        <Button
          label={t.t('common.cancel')}
          variant="secondary"
          style={{ margin: spacing.base }}
          onPress={() => setStage('entry')}
        />
      </Screen>
    );
  }

  if (stage === 'language' && preview) {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <Card>
          <Heading level={2}>{preview.title}</Heading>
          <Body muted>{t.t('join.organizedBy', { organizer: preview.organizerName })}</Body>
          <Heading level={3} style={{ marginTop: spacing.lg }}>
            {t.t('join.chooseLanguage')}
          </Heading>
          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            {SUGGESTED.map((candidate) => (
              <Button
                key={candidate}
                label={findLanguage(candidate)?.nativeName ?? candidate}
                variant={language === candidate ? 'primary' : 'secondary'}
                testID={`language-${candidate}`}
                onPress={() => setLanguage(candidate)}
              />
            ))}
            <Button
              label={t.t('onboarding.step2Other')}
              variant="ghost"
              onPress={() => setSheetOpen(true)}
            />
          </View>
          <Button
            label={busy ? t.t('join.joining') : t.t('join.title')}
            testID="confirm-join"
            loading={busy}
            style={{ marginTop: spacing.lg }}
            onPress={() => void join()}
          />
          <Body muted style={{ textAlign: 'center', marginTop: spacing.sm }}>
            {t.t('join.noAccountNeeded')}
          </Body>
        </Card>
        {sheetOpen ? (
          <LanguageSheet
            value={language}
            onChange={setLanguage}
            onClose={() => setSheetOpen(false)}
          />
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen style={{ justifyContent: 'center' }}>
      <Card>
        <Heading level={1}>{t.t('join.title')}</Heading>
        <Body muted style={{ marginTop: spacing.sm }}>
          {t.t('join.codeHelp')}
        </Body>

        <TextInput
          value={code}
          onChangeText={(value) => setCode(normalizeAccessCode(value))}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          maxLength={6}
          placeholder={t.t('join.codePlaceholder')}
          placeholderTextColor={theme.textMuted}
          accessibilityLabel={t.t('join.enterCode')}
          testID="code-input"
          style={{
            marginTop: spacing.lg,
            minHeight: 64,
            borderWidth: 1,
            borderColor: theme.border,
            borderRadius: radius.md,
            color: theme.text,
            fontSize: fontSize.h2,
            letterSpacing: 8,
            textAlign: 'center',
            backgroundColor: theme.background,
          }}
        />

        {error ? (
          <Body style={{ marginTop: spacing.md, color: theme.danger }}>{localised(t, error)}</Body>
        ) : null}

        <Button
          label={t.t('common.continue')}
          testID="lookup-code"
          disabled={code.length !== 6}
          loading={busy}
          style={{ marginTop: spacing.base }}
          onPress={() => void lookup(code)}
        />

        {/* The camera permission is explained before the system prompt. */}
        <Body muted style={{ marginTop: spacing.lg, fontSize: fontSize.caption }}>
          {t.t('join.cameraRationale')}
        </Body>
        <Button
          label={t.t('join.scanQr')}
          variant="secondary"
          testID="scan-qr"
          style={{ marginTop: spacing.sm, minHeight: MIN_TOUCH_TARGET }}
          onPress={() => {
            void (async () => {
              if (!cameraPermission?.granted) {
                const result = await requestCamera();
                if (!result.granted) {
                  setError('CAMERA_DENIED');
                  return;
                }
              }
              setStage('scanning');
            })();
          }}
        />

        <Text
          style={{
            color: theme.textMuted,
            textAlign: 'center',
            marginTop: spacing.base,
            fontSize: fontSize.caption,
          }}
        >
          {t.t('plans.joinAlwaysFree')}
        </Text>
      </Card>
    </Screen>
  );
}

function codeOf(error: unknown): string {
  return typeof error === 'object' && error && 'code' in error
    ? String((error as { code: unknown }).code)
    : 'INTERNAL_ERROR';
}

function localised(t: ReturnType<typeof useApp>['t'], code: string): string {
  switch (code) {
    case 'INVALID_ACCESS_CODE':
      return t.t('errors.invalidCode');
    case 'ACCESS_CODE_EXPIRED':
      return t.t('errors.codeExpired');
    case 'SESSION_ALREADY_ENDED':
      return t.t('errors.sessionEnded');
    case 'SESSION_FULL':
      return t.t('errors.sessionFull');
    case 'CAMERA_DENIED':
      return t.t('errors.cameraPermissionDenied');
    default:
      return t.t('errors.generic');
  }
}
