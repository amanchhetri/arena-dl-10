import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, SafeAreaView, Text, View } from 'react-native';
import { Button } from '@/ui/Button';
import { useGroupMembers } from '@/features/groups/api/useGroupMembers';
import { useKickMember } from '@/features/groups/api/useKickMember';
import { useAuthStore } from '@/features/auth/store';
import { t } from '@/lib/i18n';

export default function GroupMembers() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: members, isLoading } = useGroupMembers(id);
  const userId = useAuthStore((s) => s.session?.user.id);
  const kickMutation = useKickMember();

  const isOwner = (members ?? []).some((m) => m.user_id === userId && m.role === 'owner');

  function confirmKick(username: string, targetId: string) {
    Alert.alert(
      t('groups.members.kickConfirmTitle', { username }),
      t('groups.members.kickConfirmBody'),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: t('groups.members.kickConfirmAction'),
          style: 'destructive',
          onPress: () => kickMutation.mutate({ group_id: id, user_id: targetId }),
        },
      ],
    );
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
      <FlatList
        data={members ?? []}
        keyExtractor={(m) => m.user_id}
        contentContainerStyle={{ padding: 24, gap: 8 }}
        renderItem={({ item }) => {
          const isSelf = item.user_id === userId;
          const canKick = isOwner && !isSelf;
          return (
            <View className="flex-row items-center gap-3 rounded-2xl bg-bg-surface p-4">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-primary-500/30">
                <Text className="font-display text-base text-text-primary">
                  {(item.user.username ?? '?').slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="font-semibold text-text-primary">{item.user.display_name}</Text>
                <Text className="text-xs text-text-muted">@{item.user.username}</Text>
              </View>
              {item.role === 'owner' && (
                <View className="rounded-full bg-primary-500/20 px-2 py-0.5">
                  <Text className="text-xs font-semibold text-primary-500">
                    {t('groups.members.roleOwner')}
                  </Text>
                </View>
              )}
              {canKick && (
                <Button
                  variant="ghost"
                  onPress={() => confirmKick(item.user.username, item.user_id)}
                  disabled={kickMutation.isPending}
                >
                  {t('groups.members.kick')}
                </Button>
              )}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}
