import { useEffect } from 'react';
import { I18nManager } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { isRtlLocale } from '@lingolive/contracts';
import { AppProvider, useApp } from '@/hooks/use-app';

void SplashScreen.preventAutoHideAsync();

/**
 * Root navigator.
 *
 * The three product actions live on the Home tab, not in the tab bar — the
 * tab bar carries Home / History / Settings and nothing else, so the product
 * never grows a second navigation hierarchy.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <RootNavigator />
      </AppProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { ready, theme, isDark, preferences } = useApp();

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  useEffect(() => {
    // RTL is a native layout mode: allow it, and let the OS relaunch decide
    // when to flip. Forcing it mid-session would tear the UI apart.
    const shouldBeRtl = isRtlLocale(preferences.locale);
    I18nManager.allowRTL(true);
    if (I18nManager.isRTL !== shouldBeRtl) {
      I18nManager.forceRTL(shouldBeRtl);
    }
  }, [preferences.locale]);

  if (!ready) return null;

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.background },
        }}
      >
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="listen" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="discuss" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="join" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
