import { Redirect } from 'expo-router';
import { useApp } from '@/hooks/use-app';

/**
 * Entry point.
 *
 * A returning user goes straight to the product. Onboarding is shown exactly
 * once — three screens, and never again.
 */
export default function Index() {
  const { preferences, ready } = useApp();
  if (!ready) return null;
  return <Redirect href={preferences.onboardingCompleted ? '/(tabs)' : '/onboarding'} />;
}
