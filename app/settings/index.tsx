import { useRouter } from 'expo-router';
import { ScrollView, Switch } from 'react-native';
import { SettingsSection } from '@/features/settings/components/SettingsSection';
import { SettingsRow } from '@/features/settings/components/SettingsRow';
import { useAuthStore } from '@/features/auth/store';
import { useToggleProfileVisibility } from '@/features/settings/api/useToggleProfileVisibility';
import { t } from '@/lib/i18n';

export default function SettingsIndex() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const toggleVisibility = useToggleProfileVisibility();

  return (
    <ScrollView
      className="flex-1 bg-bg-base"
      contentContainerStyle={{ padding: 16, paddingTop: 24 }}
    >
      <SettingsSection title={t('settings.notifications.section')}>
        <SettingsRow
          label={t('settings.notifications.eveningTime')}
          value={profile?.notification_pref_evening_time?.slice(0, 5) ?? '20:00'}
          onPress={() => router.push('/settings/notification-time')}
          last
        />
      </SettingsSection>

      <SettingsSection title={t('settings.privacy.section')}>
        <SettingsRow
          label={t('settings.privacy.publicProfile')}
          rightSlot={
            <Switch
              value={profile?.is_public_profile ?? true}
              onValueChange={(v) => toggleVisibility.mutate(v)}
              trackColor={{ true: '#A855F7', false: undefined }}
            />
          }
          last
        />
      </SettingsSection>

      <SettingsSection title={t('settings.account.section')}>
        <SettingsRow
          label={t('settings.account.displayName')}
          value={profile?.display_name ?? ''}
          onPress={() => router.push('/settings/display-name')}
        />
        <SettingsRow label={t('settings.account.username')} value={`@${profile?.username ?? ''}`} />
        <SettingsRow label={t('settings.account.email')} value="—" last />
      </SettingsSection>

      <SettingsSection title={t('settings.danger.section')}>
        <SettingsRow
          label={t('settings.danger.deleteAccount')}
          destructive
          onPress={() => router.push('/settings/delete-account')}
          last
        />
      </SettingsSection>
    </ScrollView>
  );
}
