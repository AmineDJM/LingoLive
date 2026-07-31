import { useRef, useState } from 'react';
import { AccessibilityInfo, FlatList, Pressable, Text, View } from 'react-native';
import { isRtlLanguage } from '@lingolive/contracts';
import type { RenderedLine } from '@lingolive/realtime-core';
import { fontSize, radius, spacing, transcriptFontSize } from '@lingolive/design-tokens';
import { useApp } from '@/hooks/use-app';
import { Body } from './ui';

/**
 * The live transcript.
 *
 * `FlatList` virtualises it, which matters: a two-hour conference produces
 * thousands of lines, and rendering them all would drain the battery it is
 * running on.
 *
 * Auto-scroll follows the live edge only while the reader is already there.
 * Scroll back to re-read something and it stops chasing you, offering one
 * button to return.
 */
export function TranscriptView({
  lines,
  readingLanguage,
  emptyLabel,
  backToLiveLabel,
  liveRegionLabel,
}: {
  lines: readonly RenderedLine[];
  readingLanguage: string;
  emptyLabel: string;
  backToLiveLabel: string;
  liveRegionLabel: string;
}) {
  const { theme, preferences } = useApp();
  const listRef = useRef<FlatList<RenderedLine>>(null);
  const [pinned, setPinned] = useState(true);
  const lastAnnounced = useRef<string | null>(null);

  const size = transcriptFontSize(preferences.transcriptScale);
  const rtl = isRtlLanguage(readingLanguage);

  // Announce completed lines only — never partials, which would make a screen
  // reader unusable during a live transcript.
  const latestFinal = [...lines].reverse().find((line) => line.isFinal);
  if (latestFinal && latestFinal.id !== lastAnnounced.current) {
    lastAnnounced.current = latestFinal.id;
    AccessibilityInfo.announceForAccessibility(latestFinal.text);
  }

  return (
    <View style={{ flex: 1 }} accessibilityLabel={liveRegionLabel}>
      <FlatList
        ref={listRef}
        data={[...lines]}
        keyExtractor={(item) => item.id}
        testID="transcript"
        contentContainerStyle={{ paddingVertical: spacing.base, gap: spacing.base }}
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          const distance = contentSize.height - contentOffset.y - layoutMeasurement.height;
          setPinned(distance < 60);
        }}
        scrollEventThrottle={64}
        onContentSizeChange={() => {
          if (pinned) listRef.current?.scrollToEnd({ animated: true });
        }}
        ListEmptyComponent={
          <Body muted style={{ textAlign: 'center', padding: spacing.xxl }}>
            {emptyLabel}
          </Body>
        }
        renderItem={({ item }) => (
          <Text
            testID={item.isFinal ? 'segment-final' : 'segment-partial'}
            maxFontSizeMultiplier={2.5}
            style={{
              color: item.isFinal ? theme.transcriptFinal : theme.transcriptPartial,
              fontSize: size,
              lineHeight: size * 1.4,
              writingDirection: rtl ? 'rtl' : 'ltr',
              textAlign: rtl ? 'right' : 'left',
            }}
          >
            {item.text}
          </Text>
        )}
      />

      {!pinned ? (
        <Pressable
          onPress={() => {
            listRef.current?.scrollToEnd({ animated: true });
            setPinned(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={backToLiveLabel}
          testID="back-to-live"
          style={{
            position: 'absolute',
            bottom: spacing.base,
            alignSelf: 'center',
            backgroundColor: theme.primary,
            borderRadius: radius.full,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            minHeight: 48,
            justifyContent: 'center',
          }}
        >
          <Text
            style={{ color: theme.textOnPrimary, fontWeight: '700', fontSize: fontSize.bodySmall }}
          >
            ↓ {backToLiveLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
