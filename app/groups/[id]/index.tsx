import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, Text, View } from 'react-native';
import { ThemeAccent } from '@/features/groups/components/ThemeAccent';
import { MemberAvatarRow } from '@/features/groups/components/MemberAvatarRow';
import { InviteCodeCard } from '@/features/groups/components/InviteCodeCard';
import { GroupChallengesSection } from '@/features/groups/components/GroupChallengesSection';
import { useGroup } from '@/features/groups/api/useGroup';
import { useGroupMembers } from '@/features/groups/api/useGroupMembers';
import { useShareInviteCode } from '@/features/groups/api/useShareInviteCode';
import { useRegenerateInviteCode } from '@/features/groups/api/useRegenerateInviteCode';
import { useAuthStore } from '@/features/auth/store';
import { Icon, ICON_DEFAULTS } from '@/lib/icons';
import { t } from '@/lib/i18n';

export default function GroupHome() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: group, isLoading } = useGroup(id);
  const { data: members } = useGroupMembers(id);
  const userId = useAuthStore((s) => s.session?.user.id);
  const shareMutation = useShareInviteCode();
  const regenerateMutation = useRegenerateInviteCode();

  if (isLoading || !group) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg-base">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  const isOwner = (members ?? []).some((m) => m.user_id === userId && m.role === 'owner');

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <ThemeAccent theme={group.theme} size={20} />
            <Text className="font-display text-3xl text-text-primary">{group.name}</Text>
          </View>
          <Pressable onPress={() => router.push(`/groups/${group.id}/settings`)} className="p-2">
            <Icon.Settings {...ICON_DEFAULTS} color="#F4F4F8" />
          </Pressable>
        </View>

        <Text className="text-text-muted">
          {t('groups.home.memberCount', { count: group.member_count })}
        </Text>

        <Pressable onPress={() => router.push(`/groups/${group.id}/members`)}>
          <MemberAvatarRow members={members ?? []} maxShown={5} />
        </Pressable>

        <GroupChallengesSection
          groupId={group.id}
          onChallengePress={(cid) => router.push(`/challenge/${cid}`)}
          onSeeAll={() => router.push(`/groups/${group.id}/catalog`)}
          onCreateFirst={() => router.push(`/groups/${group.id}/create-challenge`)}
        />

        <InviteCodeCard
          code={group.invite_code}
          isOwner={isOwner}
          onShare={() =>
            shareMutation.mutate({
              group_id: group.id,
              group_name: group.name,
              invite_code: group.invite_code,
            })
          }
          onRegenerate={
            isOwner ? () => regenerateMutation.mutate({ group_id: group.id }) : undefined
          }
          regenerating={regenerateMutation.isPending}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
