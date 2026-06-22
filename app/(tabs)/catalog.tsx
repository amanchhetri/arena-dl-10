import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { CategoryChip } from '@/features/challenges/components/CategoryChip';
import { ChallengeCard } from '@/features/challenges/components/ChallengeCard';
import { usePresetChallenges } from '@/features/challenges/api/usePresetChallenges';
import { useMyAccepts } from '@/features/challenges/api/useMyAccepts';
import { useAuthStore } from '@/features/auth/store';
import { EmptyState } from '@/ui/EmptyState';
import { t } from '@/lib/i18n';
import type { Category } from '@/types/database';

const FILTERS: { id: Category | 'all'; labelKey: string }[] = [
  { id: 'all', labelKey: 'catalog.all' },
  { id: 'fitness', labelKey: 'catalog.fitness' },
  { id: 'study', labelKey: 'catalog.study' },
  { id: 'habit', labelKey: 'catalog.habit' },
  { id: 'dare', labelKey: 'catalog.dare' },
  { id: 'creative', labelKey: 'catalog.creative' },
];

export default function CatalogTab() {
  const router = useRouter();
  const [category, setCategory] = useState<Category | 'all'>('all');
  const { data: challenges, isLoading } = usePresetChallenges(category);
  const { data: accepts } = useMyAccepts('accepted');
  const acceptedIds = new Set((accepts ?? []).map((a) => a.challenge_id));
  const userId = useAuthStore((s) => s.session?.user.id);
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['challenges', 'presets'] }),
        qc.invalidateQueries({ queryKey: ['accepts', 'mine', userId] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="px-6 pb-3 pt-4">
        <Text className="font-display text-3xl text-text-primary">{t('catalog.title')}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, gap: 8 }}
        className="mb-3 max-h-12"
      >
        {FILTERS.map((f) => (
          <CategoryChip
            key={f.id}
            label={t(f.labelKey)}
            active={category === f.id}
            onPress={() => setCategory(f.id)}
          />
        ))}
      </ScrollView>
      {isLoading ? (
        <ActivityIndicator className="mt-12" />
      ) : (
        <FlatList
          data={challenges}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 24, gap: 12 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A855F7" />
          }
          ListEmptyComponent={
            <EmptyState
              emoji="🔍"
              label={`No ${category === 'all' ? '' : category} challenges yet`}
            />
          }
          renderItem={({ item }) => (
            <ChallengeCard
              challenge={item}
              accepted={acceptedIds.has(item.id)}
              onPress={() => router.push({ pathname: '/challenge/[id]', params: { id: item.id } })}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}
