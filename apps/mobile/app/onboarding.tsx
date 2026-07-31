import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAudioRecorderPermissions } from '@/hooks/use-audio-permission';
import { findLanguage } from '@lingolive/contracts';
import { spacing } from '@lingolive/design-tokens';
import { useApp } from '@/hooks/use-app';
import { Body, Button, Card, Heading, Screen } from '@/components/ui';
import { LanguageSheet } from '@/components/language-sheet';

/**
 * Onboarding: three screens, shown once.
 *
 * The order matters. The microphone permission is requested on the *third*
 * screen, after the app has explained what the microphone is used for and
 * what happens to the audio — never as the first thing someone sees.
 */
const SUGGESTED = ['fr', 'en', 'ar', 'es', 'pt-BR', 'it', 'de'] as const;

export default function Onboarding() {
  const { t, preferences, update, haptic } = useApp();
  const router = useRouter();
  const { request } = useAudioRecorderPermissions();

  const [step, setStep] = useState(0);
  const [language, setLanguage] = useState(preferences.readingLanguage);
  const [sheetOpen, setSheetOpen] = useState(false);

  const finish = (): void => {
    update({ onboardingCompleted: true, readingLanguage: language });
    haptic('success');
    router.replace('/(tabs)');
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: spacing.lg }}>
        {step === 0 ? (
          <Card>
            <Heading level={1}>{t.t('onboarding.step1Title')}</Heading>
            <Body muted style={{ marginTop: spacing.md }}>
              {t.t('onboarding.step1Body')}
            </Body>
            <Button
              label={t.t('common.continue')}
              testID="onboarding-continue"
              style={{ marginTop: spacing.xl }}
              onPress={() => setStep(1)}
            />
          </Card>
        ) : null}

        {step === 1 ? (
          <Card>
            <Heading level={1}>{t.t('onboarding.step2Title')}</Heading>
            <Body muted style={{ marginTop: spacing.sm }}>
              {t.t('onboarding.step2Body')}
            </Body>
            <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
              {SUGGESTED.map((code) => (
                <Button
                  key={code}
                  label={findLanguage(code)?.nativeName ?? code}
                  variant={language === code ? 'primary' : 'secondary'}
                  testID={`onboarding-language-${code}`}
                  onPress={() => setLanguage(code)}
                />
              ))}
              <Button
                label={t.t('onboarding.step2Other')}
                variant="ghost"
                onPress={() => setSheetOpen(true)}
              />
            </View>
            <Button
              label={t.t('common.continue')}
              style={{ marginTop: spacing.lg }}
              onPress={() => setStep(2)}
            />
          </Card>
        ) : null}

        {step === 2 ? (
          <Card>
            <Heading level={1}>{t.t('onboarding.step3Title')}</Heading>
            <Body muted style={{ marginTop: spacing.md }}>
              {t.t('onboarding.step3Body')}
            </Body>
            <Body muted style={{ marginTop: spacing.md }}>
              {t.t('onboarding.step3Consent')}
            </Body>
            <Button
              label={t.t('onboarding.allowMicrophone')}
              testID="onboarding-allow-microphone"
              style={{ marginTop: spacing.xl }}
              onPress={() => {
                // The system prompt appears only now — after the explanation.
                void request().finally(finish);
              }}
            />
            {/* Exploring without granting the microphone must remain possible. */}
            <Button
              label={t.t('onboarding.skipForNow')}
              variant="ghost"
              testID="onboarding-later"
              style={{ marginTop: spacing.sm }}
              onPress={finish}
            />
          </Card>
        ) : null}
      </ScrollView>

      {sheetOpen ? (
        <LanguageSheet
          value={language}
          allowOriginal={false}
          onChange={setLanguage}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}
    </Screen>
  );
}
