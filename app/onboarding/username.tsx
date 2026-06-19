import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, SafeAreaView, Text, View } from 'react-native';
import { Button } from '@/ui/Button';
import { StepHeader } from '@/features/onboarding/components/StepHeader';
import { UsernameInput } from '@/features/onboarding/components/UsernameInput';
import { useClaimUsername } from '@/features/onboarding/api/useClaimUsername';
import { useUsernameAvailable } from '@/features/onboarding/api/useUsernameAvailable';
import { t } from '@/lib/i18n';

export default function UsernameStep() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const { data: avail } = useUsernameAvailable(value);
  const claim = useClaimUsername();

  const canContinue = Boolean(avail?.available) && !claim.isPending;

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-1 px-6 pt-8">
        <StepHeader step={1} />
        <Text className="mb-8 font-display text-3xl text-text-primary">
          {t('onboarding.username.title')}
        </Text>
        <UsernameInput value={value} onChange={setValue} />
      </View>
      <View className="px-6 pb-8">
        <Button
          disabled={!canContinue}
          onPress={async () => {
            try {
              await claim.mutateAsync(value);
              router.push('/onboarding/interests');
            } catch (e) {
              Alert.alert(t('auth.errors.generic'), (e as Error).message);
            }
          }}
        >
          {t('onboarding.username.continue')}
        </Button>
      </View>
    </SafeAreaView>
  );
}
