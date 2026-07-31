import { useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { findLanguage, UI_LOCALE_DEFINITIONS } from '@lingolive/contracts';
import {
  clampTranscriptScale,
  TRANSCRIPT_SCALE_MAX,
  TRANSCRIPT_SCALE_MIN,
  spacing,
} from '@lingolive/design-tokens';
import { useApp } from '@/hooks/use-app';
import { clearIdentity, createApiClient } from '@/services/api';
import { Body, Button, Card, Divider, Heading, Screen } from '@/components/ui';
import { LanguageSheet } from '@/components/language-sheet';

/**
 * Settings.
 *
 * Short by design. Advanced and technical switches are configuration, not
 * user-facing options; what is here is what someone would actually want to
 * change about how they read and what is kept.
 */
export default function SettingsScreen() {
  const { t, preferences, update, theme } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const deleteAccount = async (): Promise<void> => {
    setDeleting(true);
    try {
      await createApiClient().deleteMe();
      await clearIdentity();
      update({ onboardingCompleted: false });
      router.replace('/onboarding');
    } finally {
      setDeleting(false);
    }
  };

  const adjustScale = (delta: number): void => {
    update({ transcriptScale: clampTranscriptScale(preferences.transcriptScale + delta) });
  };

  return (
    <Screen padded={false} style={{ paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ padding: spacing.base, gap: spacing.base }}>
        <Heading level={1}>{t.t('settings.title')}</Heading>

        <Card>
          <Body style={{ fontWeight: '600' }}>{t.t('settings.interfaceLanguage')}</Body>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: spacing.sm,
              marginTop: spacing.md,
            }}
          >
            {UI_LOCALE_DEFINITIONS.map((definition) => (
              <Button
                key={definition.locale}
                label={definition.nativeName}
                variant={preferences.locale === definition.locale ? 'primary' : 'secondary'}
                testID={`locale-${definition.locale}`}
                onPress={() => update({ locale: definition.locale })}
              />
            ))}
          </View>

          <Divider />

          <Body style={{ fontWeight: '600' }}>{t.t('settings.readingLanguage')}</Body>
          <Button
            label={
              findLanguage(preferences.readingLanguage)?.nativeName ?? preferences.readingLanguage
            }
            variant="secondary"
            testID="reading-language"
            style={{ marginTop: spacing.sm }}
            onPress={() => setSheetOpen(true)}
          />

          <Divider />

          <Body style={{ fontWeight: '600' }}>{t.t('settings.appearance')}</Body>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
            {(['system', 'light', 'dark'] as const).map((option) => (
              <Button
                key={option}
                label={t.t(
                  `settings.appearance${option[0]!.toUpperCase()}${option.slice(1)}` as 'settings.appearanceSystem',
                )}
                variant={preferences.theme === option ? 'primary' : 'secondary'}
                testID={`theme-${option}`}
                style={{ flex: 1 }}
                onPress={() => update({ theme: option })}
              />
            ))}
          </View>
        </Card>

        <Card>
          <Body style={{ fontWeight: '600' }}>{t.t('settings.transcriptSize')}</Body>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              marginTop: spacing.sm,
            }}
          >
            <Button
              label="A−"
              variant="secondary"
              testID="scale-down"
              style={{ flex: 1 }}
              disabled={preferences.transcriptScale <= TRANSCRIPT_SCALE_MIN}
              onPress={() => adjustScale(-0.25)}
            />
            <Body testID="scale-value">{`${Math.round(preferences.transcriptScale * 100)}%`}</Body>
            <Button
              label="A+"
              variant="secondary"
              testID="scale-up"
              style={{ flex: 1 }}
              disabled={preferences.transcriptScale >= TRANSCRIPT_SCALE_MAX}
              onPress={() => adjustScale(0.25)}
            />
          </View>

          <Divider />

          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Body style={{ flex: 1 }}>{t.t('settings.haptics')}</Body>
            <Switch
              value={preferences.hapticsEnabled}
              onValueChange={(value) => update({ hapticsEnabled: value })}
              testID="haptics-switch"
              trackColor={{ true: theme.primary, false: theme.border }}
            />
          </View>
        </Card>

        <Card>
          <Body style={{ fontWeight: '600' }}>{t.t('settings.sectionPrivacy')}</Body>
          <Body muted style={{ marginTop: spacing.sm }}>
            {t.t('settings.autoSaveHint')}
          </Body>
          <Body muted style={{ marginTop: spacing.sm }}>
            {t.t('listen.audioNotStored')}
          </Body>
        </Card>

        <Card>
          <Body style={{ fontWeight: '600' }}>{t.t('settings.sectionAccount')}</Body>
          {confirmDelete ? (
            <>
              <Body style={{ marginTop: spacing.md, color: theme.danger }}>
                {t.t('settings.deleteAccountConfirmBody')}
              </Body>
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                <Button
                  label={t.t('common.cancel')}
                  variant="secondary"
                  style={{ flex: 1 }}
                  onPress={() => setConfirmDelete(false)}
                />
                <Button
                  label={t.t('common.delete')}
                  variant="danger"
                  testID="confirm-delete-account"
                  loading={deleting}
                  style={{ flex: 1 }}
                  onPress={() => void deleteAccount()}
                />
              </View>
            </>
          ) : (
            <Button
              label={t.t('settings.deleteAccount')}
              variant="danger"
              testID="delete-account"
              style={{ marginTop: spacing.md }}
              onPress={() => setConfirmDelete(true)}
            />
          )}
        </Card>

        <Body muted style={{ textAlign: 'center' }}>
          {t.t('settings.version', { version: Constants.expoConfig?.version ?? '1.0.0' })}
        </Body>
      </ScrollView>

      {sheetOpen ? (
        <LanguageSheet
          value={preferences.readingLanguage}
          onChange={(language) => update({ readingLanguage: language })}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}
    </Screen>
  );
}
