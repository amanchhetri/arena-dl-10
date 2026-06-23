import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, SafeAreaView, Text, View } from 'react-native';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { GroupCard } from '@/features/groups/components/GroupCard';
import { useMyGroups } from '@/features/groups/api/useMyGroups';
import { t } from '@/lib/i18n';

export default function GroupsTab() {
  const router = useRouter();
  const { data: groups, isLoading } = useMyGroups();

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="px-6 pb-3 pt-4">
        <Text className="font-display text-3xl text-text-primary">{t('groups.title')}</Text>
      </View>
      {isLoading ? (
        <ActivityIndicator className="mt-12" />
      ) : !groups || groups.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <EmptyState emoji="👥" label={t('groups.list.empty.body')} />
          <View className="mt-4 w-full gap-3">
            <Button onPress={() => router.push('/groups/create')}>
              {t('groups.list.empty.create')}
            </Button>
            <Button variant="ghost" onPress={() => router.push('/groups/join')}>
              {t('groups.list.empty.join')}
            </Button>
          </View>
        </View>
      ) : (
        <>
          <FlatList
            data={groups}
            keyExtractor={(g) => g.id}
            contentContainerStyle={{ padding: 24, gap: 12, paddingBottom: 100 }}
            renderItem={({ item }) => (
              <GroupCard group={item} onPress={() => router.push(`/groups/${item.id}`)} />
            )}
          />
          {groups.length < 5 && (
            <View className="absolute bottom-24 left-0 right-0 px-6">
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Button onPress={() => router.push('/groups/create')}>
                    {t('groups.list.empty.create')}
                  </Button>
                </View>
                <View className="flex-1">
                  <Button variant="ghost" onPress={() => router.push('/groups/join')}>
                    {t('groups.list.empty.join')}
                  </Button>
                </View>
              </View>
            </View>
          )}
        </>
      )}
    </SafeAreaView>
  );
}
