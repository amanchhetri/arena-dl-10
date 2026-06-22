import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, SafeAreaView, Text, TextInput, View } from 'react-native';
import { Button } from '@/ui/Button';
import { useAuthStore } from '@/features/auth/store';
import { useUpdateNotifTime } from '@/features/settings/api/useUpdateNotifTime';
import { t } from '@/lib/i18n';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export default function NotificationTimeEdit() {
  const router = useRouter();
  const current = useAuthStore((s) => s.profile?.notification_pref_evening_time ?? '20:00');
  const [value, setValue] = useState(current.slice(0, 5));
  const mutation = useUpdateNotifTime();

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-1 px-6 pt-8">
        <Text className="mb-6 font-display text-2xl text-text-primary">
          {t('settings.notifications.eveningTime')}
        </Text>
        <TextInput
          value={value}
          onChangeText={(v) => setValue(v.replace(/[^0-9:]/g, '').slice(0, 5))}
          placeholder="20:00"
          placeholderTextColor="#8B8B98"
          keyboardType="numbers-and-punctuation"
          className="rounded-2xl bg-bg-surface px-4 py-3 text-base text-text-primary"
        />
        <Text className="mt-2 text-xs text-text-muted">24h format · HH:MM</Text>
      </View>
      <View className="px-6 pb-8">
        <Button
          disabled={mutation.isPending || !HHMM.test(value)}
          onPress={async () => {
            try {
              await mutation.mutateAsync(`${value}:00`);
              router.back();
            } catch (e) {
              Alert.alert(t('auth.errors.generic'), (e as Error).message);
            }
          }}
        >
          {t('settings.notifications.set')}
        </Button>
      </View>
    </SafeAreaView>
  );
}
