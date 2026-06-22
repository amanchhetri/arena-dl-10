import { useRouter } from 'expo-router';
import { Alert, SafeAreaView, Text, View } from 'react-native';
import { Button } from '@/ui/Button';
import { useAuthStore } from '@/features/auth/store';
import { useDeleteAccount } from '@/features/settings/api/useDeleteAccount';
import { t } from '@/lib/i18n';

export default function DeleteAccount() {
  const router = useRouter();
  const username = useAuthStore((s) => s.profile?.username ?? '');
  const mutation = useDeleteAccount();

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-1 px-6 pt-8">
        <Text className="mb-4 font-display text-2xl text-accent-pink">
          {t('settings.danger.deleteConfirmTitle', { username })}
        </Text>
        <Text className="mb-8 text-base text-text-muted">
          {t('settings.danger.deleteConfirmBody')}
        </Text>
      </View>
      <View className="gap-3 px-6 pb-8">
        <Button
          disabled={mutation.isPending}
          onPress={async () => {
            try {
              await mutation.mutateAsync();
            } catch (e) {
              Alert.alert(t('auth.errors.generic'), (e as Error).message);
            }
          }}
        >
          {mutation.isPending
            ? t('settings.danger.deleting')
            : t('settings.danger.deleteConfirmAction')}
        </Button>
        <Button variant="ghost" disabled={mutation.isPending} onPress={() => router.back()}>
          Cancel
        </Button>
      </View>
    </SafeAreaView>
  );
}
