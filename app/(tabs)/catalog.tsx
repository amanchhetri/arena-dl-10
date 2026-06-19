import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, SafeAreaView, Text, View, ScrollView } from 'react-native';
import { CategoryChip } from '@/features/challenges/components/CategoryChip';
import { ChallengeCard } from '@/features/challenges/components/ChallengeCard';
import { usePresetChallenges } from '@/features/challenges/api/usePresetChallenges';
import { useMyAccepts } from '@/features/challenges/api/useMyAccepts';
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
