import { forwardRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { fontSize, MIN_TOUCH_TARGET, radius, spacing } from '@lingolive/design-tokens';
import { useApp } from '@/hooks/use-app';

/**
 * Native primitives.
 *
 * Every one of them reads colours from the active theme rather than a literal,
 * and every touchable meets the 48pt minimum from the design system.
 */

export function Screen({
  children,
  style,
  padded = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  const { theme } = useApp();
  return (
    <View
      style={[
        { flex: 1, backgroundColor: theme.background },
        padded && { padding: spacing.base },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { theme } = useApp();
  return (
    <View
      style={[
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.lg,
          padding: spacing.lg,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

export const Button = forwardRef<View, PressableProps & {
  label: string;
  variant?: Variant;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}>(function Button({ label, variant = 'primary', loading, style, disabled, ...props }, ref) {
  const { theme } = useApp();
  const background =
    variant === 'primary'
      ? theme.primary
      : variant === 'danger'
        ? theme.dangerSoft
        : variant === 'ghost'
          ? 'transparent'
          : theme.surface;
  const color =
    variant === 'primary' ? theme.textOnPrimary : variant === 'danger' ? theme.danger : theme.text;

  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled), busy: Boolean(loading) }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          minHeight: MIN_TOUCH_TARGET,
          borderRadius: radius.md,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: background,
          borderWidth: variant === 'secondary' ? StyleSheet.hairlineWidth : 0,
          borderColor: theme.border,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <Text style={{ color, fontSize: fontSize.body, fontWeight: '600' }}>{label}</Text>
      )}
    </Pressable>
  );
});

export function Heading({
  children,
  level = 1,
  style,
}: {
  children: React.ReactNode;
  level?: 1 | 2 | 3;
  style?: StyleProp<TextStyle>;
}) {
  const { theme } = useApp();
  const size = level === 1 ? fontSize.h1 : level === 2 ? fontSize.h2 : fontSize.title;
  return (
    <Text
      accessibilityRole="header"
      // Respect Dynamic Type, but stop runaway scaling from breaking layout.
      maxFontSizeMultiplier={2}
      style={[{ color: theme.text, fontSize: size, fontWeight: '700' }, style]}
    >
      {children}
    </Text>
  );
}

export function Body({
  children,
  muted,
  style,
  ...props
}: TextProps & { children: React.ReactNode; muted?: boolean }) {
  const { theme } = useApp();
  return (
    <Text
      maxFontSizeMultiplier={2.5}
      style={[
        {
          color: muted ? theme.textSecondary : theme.text,
          fontSize: fontSize.body,
          lineHeight: fontSize.body * 1.5,
        },
        style,
      ]}
      {...props}
    >
      {children}
    </Text>
  );
}

/**
 * The live indicator. Colour is never the only signal: the pulsing dot always
 * sits beside the word "LIVE" and carries an accessibility label.
 */
export function LiveBadge({ label, paused }: { label: string; paused?: boolean }) {
  const { theme } = useApp();
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: paused ? theme.surface : theme.liveSoft,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.full,
      }}
    >
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: paused ? theme.textMuted : theme.live,
        }}
      />
      <Text style={{ color: paused ? theme.textSecondary : theme.liveText, fontWeight: '700', fontSize: fontSize.caption }}>
        {label}
      </Text>
    </View>
  );
}

export function Divider() {
  const { theme } = useApp();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border, marginVertical: spacing.base }} />;
}
