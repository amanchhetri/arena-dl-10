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
import { PeriodTogglePill } from '@/features/groups/components/PeriodTogglePill';
import { LeaderboardRow } from '@/features/groups/components/LeaderboardRow';
import { useGroupLeaderboard } from '@/features/groups/api/useGroupLeaderboard';
import { useAuthStore } from '@/features/auth/store';
import { analytics } from '@/lib/analytics/client';
import { t } from '@/lib/i18n';
import type { LeaderboardPeriod } from '@/types/database';

export default function GroupLeaderboard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [period, setPeriod] = useState<LeaderboardPeriod>('this_week');
  const { data: rows, isLoading, error } = useGroupLeaderboard(id, period);
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user.id);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (id && rows) {
      analytics.track('leaderboard_viewed', {
        group_id: id,
        period,
        rows_shown: rows.length,
      });
    }
  }, [id, rows, period]);

  function handlePeriodChange(next: LeaderboardPeriod) {
    if (next === period) return;
    analytics.track('leaderboard_period_switched', {
      group_id: id,
      from: period,
      to: next,
    });
    setPeriod(next);
  }

  async function onRefresh() {
    setRefreshing(true);
    try {
      await qc.invalidateQueries({ queryKey: ['leaderboard', id, period] });
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

  if (error || !rows) {
    const code = (error as unknown as { code?: string } | null)?.code;
    const msg = code === '42501' ? t('leaderboard.errors.notMember') : t('auth.errors.generic');
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg-base px-6">
        <Text className="text-center text-text-muted">{msg}</Text>
      </SafeAreaView>
    );
  }

  const allZero = rows.every((r) => r.xp_total === 0);

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="px-4 pt-3">
        <PeriodTogglePill value={period} onChange={handlePeriodChange} />
      </View>
      {allZero ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="mb-2 text-4xl">🏁</Text>
          <Text className="text-center text-text-muted">{t('leaderboard.empty.screen')}</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.user_id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A855F7" />
          }
          renderItem={({ item }) => <LeaderboardRow row={item} isSelf={item.user_id === userId} />}
        />
      )}
    </SafeAreaView>
  );
}
