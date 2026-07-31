import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { findLanguage, ORIGINAL_LANGUAGE } from '@lingolive/contracts';
import { spacing } from '@lingolive/design-tokens';
import { useApp } from '@/hooks/use-app';
import { useSession } from '@/hooks/use-session';
import { useAudioRecorderPermissions } from '@/hooks/use-audio-permission';
import { createApiClient } from '@/services/api';
import { Body, Button, Card, Heading, LiveBadge, Screen } from '@/components/ui';
import { TranscriptView } from '@/components/transcript-view';
import { LanguageSheet } from '@/components/language-sheet';

/**
 * Listen mode.
 *
 * The whole screen is the transcript. The only controls are pause, end, and
 * the reading language — everything else is out of the way while someone is
 * trying to follow a conversation.
 */
export default function ListenScreen() {
  const { t, theme, preferences, haptic } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status, request } = useAudioRecorderPermissions();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  const session = useSession({
    kind: 'PERSONAL_LISTEN',
    readingLanguage: preferences.readingLanguage,
  });

  const state = session.context.state;
  const paused = state === 'paused';
  const languageLabel =
    session.readingLanguage === ORIGINAL_LANGUAGE
      ? t.t('languagePicker.original')
      : (findLanguage(session.readingLanguage)?.nativeName ?? session.readingLanguage);

  const begin = async (): Promise<void> => {
    if (status !== 'granted') {
      const granted = await request();
      if (granted !== 'granted') return;
    }
    haptic('medium');
    await session.start();
  };

  const save = async (): Promise<void> => {
    if (!session.sessionId) return;
    await createApiClient().saveSession(session.sessionId, { confirmed: true });
    haptic('success');
    setSaved(true);
  };

  const discard = async (): Promise<void> => {
    if (session.sessionId) await createApiClient().deleteSession(session.sessionId);
    router.back();
  };

  if (state === 'ended') {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <Card>
          <Heading level={1}>{t.t('listen.endedTitle')}</Heading>
          <Body muted style={{ marginTop: spacing.sm }}>
            {t.t('listen.endedDuration', { duration: t.formatDuration(session.elapsedSeconds) })}
          </Body>
          <Body muted style={{ marginTop: spacing.xs }}>
            {t.t('listen.audioNotStored')}
          </Body>
          {saved ? (
            <Body style={{ marginTop: spacing.lg }}>{t.t('listen.savedToast')}</Body>
          ) : (
            <Button
              label={t.t('listen.saveTranscript')}
              testID="save-transcript"
              style={{ marginTop: spacing.lg }}
              onPress={() => void save()}
            />
          )}
          <Button
            label={t.t('listen.discardTranscript')}
            variant="danger"
            testID="discard-transcript"
            style={{ marginTop: spacing.sm }}
            onPress={() => void discard()}
          />
        </Card>
      </Screen>
    );
  }

  if (state === 'idle' || state === 'error') {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <Card>
          <Heading level={1}>{t.t('home.listenTitle')}</Heading>
          <Body muted style={{ marginTop: spacing.sm }}>
            {t.t('home.listenSubtitle')}
          </Body>
          {status === 'denied' ? (
            <Body style={{ marginTop: spacing.base, color: theme.danger }}>
              {t.t('errors.micPermissionDenied')}
            </Body>
          ) : null}
          {session.errorCode ? (
            <Body style={{ marginTop: spacing.base, color: theme.danger }}>
              {t.t('errors.generic')}
            </Body>
          ) : null}
          <Body muted style={{ marginTop: spacing.lg }}>
            {t.t('listen.audioNotStored')}
          </Body>
          <Button
            label={t.t('home.listenTitle')}
            testID="start-listening"
            style={{ marginTop: spacing.base }}
            onPress={() => void begin()}
          />
          <Button
            label={t.t('common.back')}
            variant="ghost"
            style={{ marginTop: spacing.sm }}
            onPress={() => router.back()}
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen padded={false} style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingHorizontal: spacing.base,
          paddingVertical: spacing.md,
        }}
      >
        <LiveBadge label={paused ? t.t('listen.paused') : t.t('listen.live')} paused={paused} />
        <Body
          muted
          testID="session-timer"
          accessibilityLabel={t.t('a11y.sessionTimer', {
            duration: t.formatClock(session.elapsedSeconds),
          })}
        >
          {t.formatClock(session.elapsedSeconds)}
        </Body>
        <View style={{ flex: 1 }} />
        <Button
          label={`${languageLabel} ⌄`}
          variant="secondary"
          testID="language-chip"
          accessibilityLabel={t.t('a11y.languageButton', { language: languageLabel })}
          onPress={() => setSheetOpen(true)}
        />
      </View>

      {session.connectionStatus === 'reconnecting' ? (
        <Body style={{ paddingHorizontal: spacing.base, color: theme.warning }}>
          {t.t('errors.network')}
        </Body>
      ) : null}

      <View style={{ flex: 1, paddingHorizontal: spacing.base }}>
        <TranscriptView
          lines={session.lines}
          readingLanguage={session.readingLanguage}
          emptyLabel={t.t('listen.waitingForSpeech')}
          backToLiveLabel={t.t('listen.backToLive')}
          liveRegionLabel={t.t('a11y.liveRegionLabel')}
        />
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.md, padding: spacing.base }}>
        <Button
          label={paused ? t.t('listen.resume') : t.t('listen.pause')}
          variant="secondary"
          testID="toggle-pause"
          style={{ flex: 1 }}
          onPress={() => {
            haptic();
            void (paused ? session.resume() : session.pause());
          }}
        />
        <Button
          label={t.t('listen.end')}
          testID="end-session"
          style={{ flex: 1 }}
          onPress={() => {
            haptic('medium');
            void session.end();
          }}
        />
      </View>

      <Body muted style={{ textAlign: 'center', paddingBottom: spacing.sm }}>
        {state === 'listening' ? t.t('listen.micIndicator') : t.t('listen.audioNotStored')}
      </Body>

      {sheetOpen ? (
        <LanguageSheet
          value={session.readingLanguage}
          onChange={session.changeLanguage}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}
    </Screen>
  );
}
