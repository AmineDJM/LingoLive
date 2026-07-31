import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, TextInput, View } from 'react-native';
import { ORIGINAL_LANGUAGE, searchLanguages, type LanguageDefinition } from '@lingolive/contracts';
import { fontSize, MIN_TOUCH_TARGET, radius, spacing } from '@lingolive/design-tokens';
import { useApp } from '@/hooks/use-app';
import { Body, Heading } from './ui';

/**
 * Language selection.
 *
 * Endonyms, no flags, accent-insensitive search. Recently used languages come
 * first because in practice people switch between the same two or three.
 */
export function LanguageSheet({
  value,
  onChange,
  onClose,
  allowOriginal = true,
}: {
  value: string;
  onChange: (language: string) => void;
  onClose: () => void;
  allowOriginal?: boolean;
}) {
  const { t, theme, preferences, useLanguage } = useApp();
  const [query, setQuery] = useState('');

  const results = useMemo<LanguageDefinition[]>(() => {
    const matches = searchLanguages(query, 80);
    if (query) return matches;
    // Recents float to the top of an unfiltered list.
    const recent = preferences.recentLanguages
      .map((code) => matches.find((language) => language.code === code))
      .filter((language): language is LanguageDefinition => Boolean(language));
    const rest = matches.filter((language) => !preferences.recentLanguages.includes(language.code));
    return [...recent, ...rest];
  }, [query, preferences.recentLanguages]);

  const select = (language: string): void => {
    useLanguage(language);
    onChange(language);
    onClose();
  };

  return (
    <Modal animationType="slide" transparent onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(13,23,38,0.55)', justifyContent: 'flex-end' }}
        onPress={onClose}
        accessibilityLabel={t.t('common.close')}
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{
            backgroundColor: theme.surface,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            maxHeight: '85%',
            padding: spacing.base,
          }}
        >
          <Heading level={2}>{t.t('languagePicker.title')}</Heading>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t.t('languagePicker.searchPlaceholder')}
            placeholderTextColor={theme.textMuted}
            accessibilityLabel={t.t('languagePicker.searchPlaceholder')}
            testID="language-search"
            style={{
              marginTop: spacing.md,
              minHeight: MIN_TOUCH_TARGET,
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: radius.md,
              paddingHorizontal: spacing.base,
              color: theme.text,
              fontSize: fontSize.body,
              backgroundColor: theme.background,
            }}
          />

          <FlatList
            data={results}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            style={{ marginTop: spacing.md }}
            ListHeaderComponent={
              allowOriginal && !query ? (
                <Row
                  selected={value === ORIGINAL_LANGUAGE}
                  label={t.t('languagePicker.original')}
                  hint={t.t('languagePicker.originalHint')}
                  onPress={() => select(ORIGINAL_LANGUAGE)}
                />
              ) : null
            }
            ListEmptyComponent={
              <Body muted style={{ textAlign: 'center', padding: spacing.xl }}>
                {t.t('languagePicker.noResults')}
              </Body>
            }
            renderItem={({ item }) => (
              <Row
                selected={value.toLowerCase() === item.code.toLowerCase()}
                label={item.nativeName}
                hint={item.englishName}
                direction={item.direction}
                testID={`language-${item.code}`}
                onPress={() => select(item.code)}
              />
            )}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Row({
  selected,
  label,
  hint,
  direction,
  testID,
  onPress,
}: {
  selected: boolean;
  label: string;
  hint: string;
  direction?: 'ltr' | 'rtl';
  testID?: string;
  onPress: () => void;
}) {
  const { theme } = useApp();
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={{
        minHeight: MIN_TOUCH_TARGET,
        justifyContent: 'center',
        paddingHorizontal: spacing.base,
        paddingVertical: spacing.md,
        borderRadius: radius.md,
        backgroundColor: selected ? theme.primarySoft : 'transparent',
      }}
    >
      <View style={{ alignItems: direction === 'rtl' ? 'flex-end' : 'flex-start' }}>
        <Body style={{ fontWeight: '600' }}>{label}</Body>
        <Body muted style={{ fontSize: fontSize.caption }}>
          {hint}
        </Body>
      </View>
    </Pressable>
  );
}
