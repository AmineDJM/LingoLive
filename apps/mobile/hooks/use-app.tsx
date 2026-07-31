import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import * as Haptics from 'expo-haptics';
import { darkTheme, lightTheme, type ThemeColors } from '@lingolive/design-tokens';
import { createTranslator, type Translator } from '@lingolive/i18n';
import {
  defaultPreferences,
  loadPreferences,
  rememberLanguage,
  savePreferences,
  type Preferences,
} from '@/services/preferences';

/**
 * Application context: preferences, resolved theme, translator and haptics.
 *
 * Small on purpose. Anything that belongs to a live session lives in
 * `@lingolive/realtime-core` instead, so it stays shared with the web app and
 * independently testable.
 */

interface AppContextValue {
  preferences: Preferences;
  ready: boolean;
  theme: ThemeColors;
  isDark: boolean;
  t: Translator;
  update: (patch: Partial<Preferences>) => void;
  useLanguage: (language: string) => void;
  haptic: (style?: 'light' | 'medium' | 'success' | 'warning') => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadPreferences().then((loaded) => {
      setPreferences(loaded);
      setReady(true);
    });
  }, []);

  const update = useCallback((patch: Partial<Preferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...patch };
      void savePreferences(next);
      return next;
    });
  }, []);

  const useLanguageCallback = useCallback((language: string) => {
    setPreferences((current) => {
      const next = rememberLanguage(current, language);
      void savePreferences(next);
      return next;
    });
  }, []);

  const isDark =
    preferences.theme === 'dark' || (preferences.theme === 'system' && systemScheme === 'dark');

  const haptic = useCallback(
    (style: 'light' | 'medium' | 'success' | 'warning' = 'light') => {
      if (!preferences.hapticsEnabled) return;
      // Haptics are advisory: a device without a taptic engine must not throw.
      if (style === 'success') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
          () => undefined,
        );
      } else if (style === 'warning') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
          () => undefined,
        );
      } else {
        void Haptics.impactAsync(
          style === 'medium'
            ? Haptics.ImpactFeedbackStyle.Medium
            : Haptics.ImpactFeedbackStyle.Light,
        ).catch(() => undefined);
      }
    },
    [preferences.hapticsEnabled],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      preferences,
      ready,
      theme: isDark ? darkTheme : lightTheme,
      isDark,
      t: createTranslator(preferences.locale),
      update,
      useLanguage: useLanguageCallback,
      haptic,
    }),
    [preferences, ready, isDark, update, useLanguageCallback, haptic],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider');
  return value;
}
