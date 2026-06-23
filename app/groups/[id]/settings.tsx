import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, ScrollView } from 'react-native';
import { SettingsSection } from '@/features/settings/components/SettingsSection';
import { SettingsRow } from '@/features/settings/components/SettingsRow';
import { useGroup } from '@/features/groups/api/useGroup';
import { useGroupMembers } from '@/features/groups/api/useGroupMembers';
import { useLeaveGroup } from '@/features/groups/api/useLeaveGroup';
import { useDeleteGroup } from '@/features/groups/api/useDeleteGroup';
import { useRegenerateInviteCode } from '@/features/groups/api/useRegenerateInviteCode';
import { useAuthStore } from '@/features/auth/store';
import { t } from '@/lib/i18n';

export default function GroupSettings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: group } = useGroup(id);
  const { data: members } = useGroupMembers(id);
  const userId = useAuthStore((s) => s.session?.user.id);

  const leaveMutation = useLeaveGroup();
  const deleteMutation = useDeleteGroup();
  const regenerateMutation = useRegenerateInviteCode();

  const isOwner = (members ?? []).some((m) => m.user_id === userId && m.role === 'owner');

  function confirmRegenerate() {
    Alert.alert(t('groups.settings.regenerateCode'), t('groups.settings.regenerateConfirm'), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: t('groups.settings.regenerateCode'),
        onPress: () => regenerateMutation.mutate({ group_id: id }),
      },
    ]);
  }

  function confirmLeave() {
    if (!group) return;
    Alert.alert(
      t('groups.settings.leaveConfirmTitle', { name: group.name }),
      t('groups.settings.leaveConfirmBody'),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: t('groups.settings.leaveConfirmAction'),
          style: 'destructive',
          onPress: async () => {
            await leaveMutation.mutateAsync({ group_id: id });
            router.replace('/(tabs)/groups');
          },
        },
      ],
    );
  }

  function confirmDelete() {
    if (!group) return;
    Alert.alert(
      t('groups.settings.deleteConfirmTitle', { name: group.name }),
      t('groups.settings.deleteConfirmBody'),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: t('groups.settings.deleteConfirmAction'),
          style: 'destructive',
          onPress: async () => {
            await deleteMutation.mutateAsync({ group_id: id });
            router.replace('/(tabs)/groups');
          },
        },
      ],
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-bg-base"
      contentContainerStyle={{ padding: 16, paddingTop: 24 }}
    >
      {isOwner && (
        <SettingsSection title="OWNER">
          <SettingsRow
            label={t('groups.settings.editName')}
            value={group?.name ?? ''}
            onPress={() => router.push(`/groups/${id}/edit-name`)}
          />
          <SettingsRow
            label={t('groups.settings.editTheme')}
            value={group?.theme ?? ''}
            onPress={() => router.push(`/groups/${id}/edit-theme`)}
          />
          <SettingsRow
            label={t('groups.settings.regenerateCode')}
            onPress={confirmRegenerate}
            last
          />
        </SettingsSection>
      )}

      <SettingsSection title="MEMBERSHIP">
        <SettingsRow label={t('groups.settings.leave')} destructive onPress={confirmLeave} last />
      </SettingsSection>

      {isOwner && (
        <SettingsSection title="DANGER ZONE">
          <SettingsRow
            label={t('groups.settings.delete')}
            destructive
            onPress={confirmDelete}
            last
          />
        </SettingsSection>
      )}
    </ScrollView>
  );
}
