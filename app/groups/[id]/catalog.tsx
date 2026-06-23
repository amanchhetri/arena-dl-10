import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, SafeAreaView, Text, View } from 'react-native';
import { ChallengeCard } from '@/features/challenges/components/ChallengeCard';
import { EmptyState } from '@/ui/EmptyState';
import { useGroupChallenges } from '@/features/groups/api/useGroupChallenges';
import { useGroupMembers } from '@/features/groups/api/useGroupMembers';
import { useAuthStore } from '@/features/auth/store';
import { t } from '@/lib/i18n';

export default function GroupCatalog() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: challenges, isLoading } = useGroupChallenges(id);
  const { data: members } = useGroupMembers(id);
  const userId = useAuthStore((s) => s.session?.user.id);

  const isOwner = (members ?? []).some((m) => m.user_id === userId && m.role === 'owner');

  function canEdit(creatorId: string | null): boolean {
    if (!creatorId) return false;
    return isOwner || creatorId === userId;
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-row items-center justify-between px-6 pb-3 pt-4">
        <Text className="font-display text-3xl text-text-primary">
          {t('groupChallenges.catalog.title')}
        </Text>
        <Pressable
          onPress={() => router.push(`/groups/${id}/create-challenge`)}
          className="rounded-full bg-primary-500 px-4 py-2 active:opacity-80"
        >
          <Text className="text-sm font-semibold text-white">
            {t('groupChallenges.catalog.newButton')}
          </Text>
        </Pressable>
      </View>
      {isLoading ? (
        <ActivityIndicator className="mt-12" />
      ) : !challenges || challenges.length === 0 ? (
        <EmptyState emoji="✨" label={t('groupChallenges.catalog.empty')} />
      ) : (
        <FlatList
          data={challenges}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 24, gap: 12 }}
          renderItem={({ item }) => (
            <Pressable
              onLongPress={
                canEdit(item.created_by)
                  ? () => router.push(`/groups/${id}/edit-challenge/${item.id}`)
                  : undefined
              }
            >
              <ChallengeCard
                challenge={item}
                onPress={() => router.push(`/challenge/${item.id}`)}
              />
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}
