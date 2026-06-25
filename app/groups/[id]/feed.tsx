import { useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  Text,
  View,
} from 'react-native';
import { ActivityEventRow } from '@/features/groups/components/ActivityEventRow';
import { useGroupFeed } from '@/features/groups/api/useGroupFeed';
import { useAuthStore } from '@/features/auth/store';
import { analytics } from '@/lib/analytics/client';
import { t } from '@/lib/i18n';

export default function GroupFeed() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: events, isLoading } = useGroupFeed(id, 50);
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user.id);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (id && events) {
      analytics.track('group_feed_viewed', { group_id: id, events_shown: events.length });
    }
  }, [id, events]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['feed', id] }),
        qc.invalidateQueries({ queryKey: ['groups', 'single', id] }),
        qc.invalidateQueries({ queryKey: ['users', userId] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg-base">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      {!events || events.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="mb-2 text-4xl">📭</Text>
          <Text className="text-center text-text-muted">{t('feed.screen.empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A855F7" />
          }
          renderItem={({ item }) => <ActivityEventRow event={item} />}
        />
      )}
    </SafeAreaView>
  );
}
