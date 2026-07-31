import { useEffect, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SessionSummary } from '@lingolive/contracts';
import { spacing } from '@lingolive/design-tokens';
import { useApp } from '@/hooks/use-app';
import { createApiClient } from '@/services/api';
import { Body, Button, Card, Heading, Screen } from '@/components/ui';

/**
 * History.
 *
 * Only what the user explicitly saved. An empty list here is the expected
 * state, not a failure — it is the privacy model working.
 */
export default function HistoryScreen() {
  const { t } = useApp();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await createApiClient().history({ limit: 50 });
      setItems(response.items);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const remove = async (id: string): Promise<void> => {
    await createApiClient().deleteSession(id);
    setItems((current) => current.filter((item) => item.id !== id));
  };

  return (
    <Screen padded={false} style={{ paddingTop: insets.top }}>
      <View style={{ padding: spacing.base }}>
        <Heading level={1}>{t.t('history.title')}</Heading>
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        testID="history-list"
        contentContainerStyle={{ padding: spacing.base, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
        ListEmptyComponent={
          loading ? null : (
            <Card>
              <Body style={{ fontWeight: '600' }}>{t.t('history.empty')}</Body>
              <Body muted style={{ marginTop: spacing.xs }}>
                {t.t('history.emptyBody')}
              </Body>
            </Card>
          )
        }
        renderItem={({ item }) => (
          <Card>
            <Body style={{ fontWeight: '600' }}>{item.title ?? t.t('history.kindListen')}</Body>
            <Body muted style={{ marginTop: spacing.xxs }}>
              {t.t('history.itemSubtitle', {
                duration: t.formatDuration(item.durationSeconds),
                languages: item.languages.join(', ') || '—',
              })}
            </Body>
            <Body muted numberOfLines={2} style={{ marginTop: spacing.sm }}>
              {item.preview}
            </Body>
            <Button
              label={t.t('common.delete')}
              variant="danger"
              testID={`delete-${item.id}`}
              style={{ marginTop: spacing.md }}
              onPress={() => void remove(item.id)}
            />
          </Card>
        )}
      />
    </Screen>
  );
}
