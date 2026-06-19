import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, SafeAreaView, ScrollView, Text, View } from 'react-native';
import { ChallengeCard } from '@/features/challenges/components/ChallengeCard';
import { useMyAccepts } from '@/features/challenges/api/useMyAccepts';
import { useSuggestedChallenges } from '@/features/challenges/api/useSuggestedChallenges';
import { useAuthStore } from '@/features/auth/store';
import { levelFromXp, xpToNextLevel } from '@/lib/challenge';
import { t } from '@/lib/i18n';

export default function Home() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const { data: accepts, isLoading: acceptsLoading } = useMyAccepts('accepted');
  const { data: suggested } = useSuggestedChallenges();

  const totalXp = Number(profile?.total_xp ?? 0);
  const level = levelFromXp(totalXp);
  const xp = xpToNextLevel(totalXp);
  const currentStreak = profile?.current_streak ?? 0;

  const streakLabel =
    currentStreak === 0
      ? t('home.noStreak')
      : currentStreak === 1
        ? t('home.streakDay')
        : t('home.streakDays', { count: currentStreak });

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 160 }}>
        <View className="flex-row items-center justify-between">
          <Text className="font-display text-2xl text-text-primary">
            {t('home.greeting', { username: profile?.username ?? '' })}
          </Text>
          <View className="flex-row items-center gap-1 rounded-full bg-flame-from/15 px-3 py-1">
            <Text className="text-base">🔥</Text>
            <Text className="text-sm font-semibold text-flame-from">{streakLabel}</Text>
          </View>
        </View>

        <View className="mt-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-text-muted">{t('home.level', { level })}</Text>
            <Text className="text-xs text-text-muted">
              {t('home.xpProgress', { current: xp.current, next: xp.next })}
            </Text>
          </View>
          <View className="mt-2 h-2 overflow-hidden rounded-full bg-bg-elevated">
            <View
              className="h-full bg-primary-500"
              style={{ width: `${Math.min(100, Math.round(xp.ratio * 100))}%` }}
            />
          </View>
        </View>

        <Text className="mt-8 text-xs font-semibold tracking-widest text-text-muted">
          {t('home.today')}
        </Text>
        {acceptsLoading ? (
          <ActivityIndicator className="mt-4" />
        ) : !accepts || accepts.length === 0 ? (
          <Text className="mt-4 text-sm text-text-muted">{t('home.emptyToday')}</Text>
        ) : (
          <View className="mt-3 gap-3">
            {accepts.map((a) => (
              <ChallengeCard
                key={a.id}
                challenge={a.challenge}
                accepted
                onPress={() =>
                  router.push({ pathname: '/challenge/[id]', params: { id: a.challenge.id } })
                }
              />
            ))}
          </View>
        )}

        <Text className="mt-8 text-xs font-semibold tracking-widest text-text-muted">
          {t('home.suggested')}
        </Text>
      </ScrollView>
      <View className="absolute bottom-20 left-0 right-0">
        <FlatList
          horizontal
          data={suggested ?? []}
          keyExtractor={(c) => c.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, gap: 12 }}
          renderItem={({ item }) => (
            <ChallengeCard
              challenge={item}
              size="compact"
              onPress={() => router.push({ pathname: '/challenge/[id]', params: { id: item.id } })}
            />
          )}
        />
      </View>
    </SafeAreaView>
  );
}
