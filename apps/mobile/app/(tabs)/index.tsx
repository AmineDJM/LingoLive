import { ScrollView, View } from 'react-native';
import { Link } from 'expo-router';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing } from '@lingolive/design-tokens';
import { useApp } from '@/hooks/use-app';
import { Body, Heading, Screen } from '@/components/ui';

/**
 * Home.
 *
 * Exactly three cards, in the product's priority order. Nothing else. The
 * entire product proposition is that this screen never grows a fourth option.
 */
export default function HomeScreen() {
  const { t, theme } = useApp();
  const insets = useSafeAreaInsets();

  const actions = [
    {
      href: '/listen' as const,
      title: t.t('home.listenTitle'),
      body: t.t('home.listenSubtitle'),
      label: t.t('a11y.listenCard'),
      primary: true,
      testID: 'home-listen',
    },
    {
      href: '/discuss' as const,
      title: t.t('home.discussTitle'),
      body: t.t('home.discussSubtitle'),
      label: t.t('a11y.discussCard'),
      primary: false,
      testID: 'home-discuss',
    },
    {
      href: '/join' as const,
      title: t.t('home.joinTitle'),
      body: t.t('home.joinSubtitle'),
      label: t.t('a11y.joinCard'),
      primary: false,
      testID: 'home-join',
    },
  ];

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.base,
          paddingTop: insets.top + spacing.base,
          gap: spacing.base,
        }}
      >
        <Heading level={1} style={{ marginBottom: spacing.sm }}>
          {t.t('home.greeting')}
        </Heading>

        {actions.map((action) => (
          <Link key={action.href} href={action.href} asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={action.label}
              testID={action.testID}
              style={({ pressed }) => ({
                backgroundColor: action.primary ? theme.primarySoft : theme.surface,
                borderColor: action.primary ? theme.primary : theme.border,
                borderWidth: action.primary ? 2 : 1,
                borderRadius: radius.xl,
                padding: spacing.lg,
                opacity: pressed ? 0.9 : 1,
                minHeight: 112,
                justifyContent: 'center',
              })}
            >
              <Heading level={2}>{action.title}</Heading>
              <Body muted style={{ marginTop: spacing.xs }}>
                {action.body}
              </Body>
            </Pressable>
          </Link>
        ))}

        <View style={{ marginTop: spacing.lg }}>
          <Body muted style={{ textAlign: 'center' }}>
            {t.t('home.guestBanner')}
          </Body>
        </View>
      </ScrollView>
    </Screen>
  );
}
