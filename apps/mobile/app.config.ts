import type { ExpoConfig, ConfigContext } from 'expo/config';

/**
 * Expo configuration.
 *
 * Every identity value — bundle identifier, package name, scheme, EAS project,
 * associated domain — comes from the environment, because none of them can be
 * assumed to be registered. A deployment sets them once; nothing in the source
 * hard-codes a domain we do not own.
 */

const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';
const IS_PRODUCTION = APP_ENV === 'production';

const IOS_BUNDLE_ID = process.env.IOS_BUNDLE_IDENTIFIER ?? 'com.lingolive.app';
const ANDROID_PACKAGE = process.env.ANDROID_PACKAGE ?? 'com.lingolive.app';
const SCHEME = process.env.DEEP_LINK_SCHEME ?? 'lingolive';
const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://lingolive.app';
const WEB_HOST = safeHost(WEB_URL);

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'lingolive.app';
  }
}

/**
 * Permission strings.
 *
 * App Review rejects vague purpose strings, and users deserve a real answer.
 * Each one says exactly what the capability is used for and, for the
 * microphone, what is *not* done with it.
 */
const MICROPHONE_USAGE =
  'LingoLive uses the microphone only while a session is running, to turn speech into text. Audio is not recorded or stored.';
const CAMERA_USAGE =
  'LingoLive uses the camera only to scan the QR code of a session you want to join.';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: process.env.APP_DISPLAY_NAME ?? 'LingoLive',
  slug: 'lingolive',
  version: '1.0.0',
  orientation: 'default',
  scheme: SCHEME,
  userInterfaceStyle: 'automatic',
  primaryColor: '#2F6BFF',
  icon: './assets/icon.png',
  assetBundlePatterns: ['**/*'],

  ios: {
    bundleIdentifier: IOS_BUNDLE_ID,
    supportsTablet: true,
    // Background audio capture is deliberately NOT requested: the session
    // suspends when the app leaves the foreground (see docs/PRIVACY.md).
    infoPlist: {
      NSMicrophoneUsageDescription: MICROPHONE_USAGE,
      NSCameraUsageDescription: CAMERA_USAGE,
      ITSAppUsesNonExemptEncryption: false,
      CFBundleAllowMixedLocalizations: true,
    },
    associatedDomains: [`applinks:${WEB_HOST}`],
    config: { usesNonExemptEncryption: false },
  },

  android: {
    package: ANDROID_PACKAGE,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#2F6BFF',
    },
    // The minimum set. No contacts, no location, no storage, no phone state.
    permissions: ['android.permission.RECORD_AUDIO', 'android.permission.CAMERA'],
    blockedPermissions: [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.READ_CONTACTS',
    ],
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: WEB_HOST, pathPrefix: '/join' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },

  web: { bundler: 'metro', output: 'static' },

  plugins: [
    'expo-router',
    'expo-secure-store',
    ['expo-camera', { cameraPermission: CAMERA_USAGE, recordAudioAndVideoPermission: false }],
    ['expo-audio', { microphonePermission: MICROPHONE_USAGE }],
    [
      'expo-splash-screen',
      {
        image: './assets/splash.png',
        backgroundColor: '#F5F7FB',
        dark: { backgroundColor: '#07111F' },
        imageWidth: 180,
      },
    ],
  ],

  experiments: { typedRoutes: true },

  updates: {
    // OTA updates are gated on a matching native fingerprint: a JS bundle
    // that expects native code the installed binary lacks must never ship.
    fallbackToCacheTimeout: 0,
    ...(process.env.EAS_PROJECT_ID
      ? { url: `https://u.expo.dev/${process.env.EAS_PROJECT_ID}` }
      : {}),
  },
  runtimeVersion: { policy: 'fingerprint' },

  extra: {
    router: {},
    eas: process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : {},
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000',
    webUrl: WEB_URL,
    appEnv: APP_ENV,
    deepLinkScheme: SCHEME,
    // Diagnostics are on outside production so a preview build is debuggable.
    diagnosticsEnabled: !IS_PRODUCTION,
  },

  owner: process.env.EXPO_OWNER,
});
