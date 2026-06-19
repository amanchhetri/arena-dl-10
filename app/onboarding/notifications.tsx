import { useRouter } from 'expo-router';
import { SafeAreaView, Text, View } from 'react-native';
import { Button } from '@/ui/Button';
import { StepHeader } from '@/features/onboarding/components/StepHeader';
import { useRegisterPushToken } from '@/features/onboarding/api/useRegisterPushToken';
import { analytics } from '@/lib/analytics/client';
import { t } from '@/lib/i18n';

export default function NotificationsStep() {
  const router = useRouter();
  const mutation = useRegisterPushToken();

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-1 items-center justify-center px-6">
        <StepHeader step={3} />
        <Text className="mb-4 text-6xl">🔥</Text>
        <Text className="mb-3 font-display text-2xl text-text-primary">
          {t('onboarding.notifications.title')}
        </Text>
        <Text className="mb-8 text-center text-base text-text-muted">
          {t('onboarding.notifications.body')}
        </Text>
      </View>
      <View className="gap-3 px-6 pb-8">
        <Button
          disabled={mutation.isPending}
          onPress={async () => {
            await mutation.mutateAsync();
            router.replace('/(tabs)');
          }}
        >
          {t('onboarding.notifications.enable')}
        </Button>
        <Button
          variant="ghost"
          onPress={() => {
            analytics.track('onboarding_step_completed', { step: 'notifications', skipped: true });
            router.replace('/(tabs)');
          }}
        >
          {t('onboarding.notifications.later')}
        </Button>
      </View>
    </SafeAreaView>
  );
}
