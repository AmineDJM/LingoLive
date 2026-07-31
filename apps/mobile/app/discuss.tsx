import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { findLanguage, type DiscussParticipantCount } from '@lingolive/contracts';
import {
  canSpeak,
  createDiscussionState,
  layoutPlacements,
  rotateTile,
  setTileLanguage,
  startSpeaking as beginTurn,
  stopSpeaking as endTurn,
  type DiscussionState,
  type DiscussionTile,
} from '@lingolive/realtime-core';
import { fontSize, MIN_TOUCH_TARGET, radius, SPEAK_BUTTON_SIZE, spacing } from '@lingolive/design-tokens';
import { useApp } from '@/hooks/use-app';
import { useSession } from '@/hooks/use-session';
import { Body, Button, Card, Heading, Screen } from '@/components/ui';
import { LanguageSheet } from '@/components/language-sheet';

/**
 * Discuss mode: the device flat on a table, two to four people around it.
 *
 * The layout, rotation and turn-taking rules come from
 * `@lingolive/realtime-core` and are identical to the web canvas — including
 * the rule that rotating a tile must never flip right-to-left text.
 */
export default function DiscussScreen() {
  const { t, theme, preferences, haptic } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [count, setCount] = useState<DiscussParticipantCount | null>(null);
  const [discussion, setDiscussion] = useState<DiscussionState | null>(null);
  const [sheetFor, setSheetFor] = useState<string | null>(null);

  const slots = useMemo(
    () =>
      discussion?.tiles.map((tile) => ({
        position: tile.position,
        readingLanguage: tile.readingLanguage,
        rotation: tile.rotation,
      })) ?? [],
    [discussion],
  );

  const session = useSession({
    kind: 'PERSONAL_DISCUSS',
    readingLanguage: 'original',
    slots,
    // Push-to-talk drives capture, not mounting the screen.
    autoStartAudio: false,
  });

  if (!discussion || !count) {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <Card>
          <Heading level={1}>{t.t('discuss.howManyPeople')}</Heading>
          <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl }}>
            {([2, 3, 4] as const).map((people) => (
              <Button
                key={people}
                label={String(people)}
                testID={`people-${people}`}
                style={{ flex: 1, minHeight: 88 }}
                variant="secondary"
                onPress={() => {
                  haptic();
                  setCount(people);
                  setDiscussion(
                    createDiscussionState(people, [
                      preferences.readingLanguage,
                      ...preferences.recentLanguages,
                      'en',
                      'ar',
                    ]),
                  );
                }}
              />
            ))}
          </View>
          <Button
            label={t.t('common.back')}
            variant="ghost"
            style={{ marginTop: spacing.lg }}
            onPress={() => router.back()}
          />
        </Card>
      </Screen>
    );
  }

  const placements = layoutPlacements(discussion);

  const speak = (tile: DiscussionTile, speaking: boolean): void => {
    if (speaking) {
      if (!canSpeak(discussion, tile.id)) return;
      haptic('medium');
      setDiscussion(beginTurn(discussion, tile.id));
      if (!session.sessionId) void session.start().then(() => session.startSpeaking(tile.id));
      else session.startSpeaking(tile.id);
    } else {
      haptic();
      setDiscussion(endTurn(discussion, tile.id));
      session.stopSpeaking(tile.id);
    }
  };

  return (
    <Screen padded={false} style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing.base,
          paddingVertical: spacing.sm,
        }}
      >
        <Body muted>{t.t('discuss.peopleCount', { count })}</Body>
        <View style={{ flex: 1 }} />
        <Button
          label={t.t('discuss.endDiscussion')}
          variant="secondary"
          testID="end-discussion"
          onPress={() => {
            void session.end();
            router.back();
          }}
        />
      </View>

      {/* A 2×2 grid backs every layout, matching how people sit at a table. */}
      <View
        testID="discussion-canvas"
        style={{
          flex: 1,
          flexDirection: 'row',
          flexWrap: 'wrap',
          padding: spacing.sm,
          gap: spacing.sm,
        }}
      >
        {discussion.tiles.map((tile) => {
          const placement = placements.find((entry) => entry.tileId === tile.id);
          const active = discussion.activeSpeakerTileId === tile.id;
          const blocked = !canSpeak(discussion, tile.id);
          const languageName = findLanguage(tile.readingLanguage)?.nativeName ?? tile.readingLanguage;
          const fullWidth = (placement?.columnSpan ?? 1) > 1;

          return (
            <View
              key={tile.id}
              testID={`tile-${tile.position}`}
              accessibilityLabel={t.t('discuss.slotLabel', { position: tile.position + 1 })}
              style={{
                width: fullWidth ? '100%' : '48.5%',
                flexGrow: 1,
                flexBasis: fullWidth ? '100%' : '48%',
                minHeight: 160,
                backgroundColor: active ? theme.liveSoft : theme.surface,
                borderColor: active ? theme.live : theme.border,
                borderWidth: 2,
                borderRadius: radius.lg,
                padding: spacing.md,
                // Rotation applies to the tile only — never to the screen.
                transform: [{ rotate: `${tile.rotation}deg` }],
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Pressable
                  onPress={() => setSheetFor(tile.id)}
                  testID={`tile-language-${tile.position}`}
                  accessibilityRole="button"
                  accessibilityLabel={t.t('a11y.languageButton', { language: languageName })}
                  style={{
                    minHeight: MIN_TOUCH_TARGET,
                    justifyContent: 'center',
                    paddingHorizontal: spacing.md,
                    borderRadius: radius.full,
                    borderWidth: 1,
                    borderColor: theme.border,
                  }}
                >
                  <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '600', fontSize: fontSize.caption }}>
                    {languageName}
                  </Text>
                </Pressable>
                <View style={{ flex: 1 }} />
                <Pressable
                  onPress={() => {
                    haptic();
                    setDiscussion(rotateTile(discussion, tile.id));
                  }}
                  testID={`tile-rotate-${tile.position}`}
                  accessibilityRole="button"
                  accessibilityLabel={t.t('a11y.rotateButton', { language: languageName })}
                  style={{
                    minHeight: MIN_TOUCH_TARGET,
                    minWidth: MIN_TOUCH_TARGET,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: radius.full,
                    borderWidth: 1,
                    borderColor: theme.border,
                  }}
                >
                  <Text style={{ color: theme.text, fontSize: 18 }}>↻</Text>
                </Pressable>
              </View>

              <ScrollView style={{ flex: 1, marginVertical: spacing.sm }}>
                {session.lines.length === 0 ? (
                  <Body muted style={{ fontSize: fontSize.bodySmall }}>
                    {t.t('discuss.waitingForOthers')}
                  </Body>
                ) : (
                  session.lines.slice(-3).map((line) => (
                    <Text
                      key={line.id}
                      style={{
                        color: line.isFinal ? theme.transcriptFinal : theme.transcriptPartial,
                        fontSize: fontSize.bodySmall,
                        lineHeight: fontSize.bodySmall * 1.35,
                        marginBottom: spacing.xs,
                        // Text direction survives rotation.
                        writingDirection: tile.direction,
                        textAlign: tile.direction === 'rtl' ? 'right' : 'left',
                      }}
                    >
                      {line.text}
                    </Text>
                  ))
                )}
              </ScrollView>

              <Pressable
                onPressIn={() => speak(tile, true)}
                onPressOut={() => speak(tile, false)}
                disabled={blocked}
                testID={`tile-speak-${tile.position}`}
                accessibilityRole="button"
                accessibilityLabel={t.t('a11y.speakButton', { language: languageName })}
                accessibilityState={{ disabled: blocked, selected: active }}
                style={{
                  minHeight: Math.min(SPEAK_BUTTON_SIZE, 64),
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radius.md,
                  backgroundColor: active ? theme.live : blocked ? theme.surfaceElevated : theme.primary,
                  opacity: blocked ? 0.6 : 1,
                }}
              >
                <Text style={{ color: blocked ? theme.textMuted : theme.textOnPrimary, fontWeight: '700' }}>
                  {active ? t.t('discuss.speaking') : blocked ? t.t('discuss.someoneElseSpeaking') : t.t('discuss.speak')}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      <Body muted style={{ textAlign: 'center', paddingBottom: spacing.sm }}>
        {t.t('discuss.tapToSpeak')}
      </Body>

      {sheetFor ? (
        <LanguageSheet
          value={discussion.tiles.find((tile) => tile.id === sheetFor)?.readingLanguage ?? 'en'}
          allowOriginal={false}
          onChange={(language) => setDiscussion(setTileLanguage(discussion, sheetFor, language))}
          onClose={() => setSheetFor(null)}
        />
      ) : null}
    </Screen>
  );
}
