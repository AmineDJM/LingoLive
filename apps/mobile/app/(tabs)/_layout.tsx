import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';
import { fontSize } from '@lingolive/design-tokens';
import { useApp } from '@/hooks/use-app';

export default function TabsLayout() {
  const { theme, t } = useApp();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
        tabBarLabelStyle: { fontSize: fontSize.caption, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t.t('nav.home'), tabBarIcon: ({ color }) => <TabGlyph glyph="●" color={color} /> }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: t.t('nav.history'), tabBarIcon: ({ color }) => <TabGlyph glyph="≡" color={color} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: t.t('nav.settings'), tabBarIcon: ({ color }) => <TabGlyph glyph="⚙" color={color} /> }}
      />
    </Tabs>
  );
}

function TabGlyph({ glyph, color }: { glyph: string; color: ColorValue }) {
  return <Text style={{ color, fontSize: 18 }} accessibilityElementsHidden>{glyph}</Text>;
}
