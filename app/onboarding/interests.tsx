import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, SafeAreaView, Text, View } from 'react-native';
import { Button } from '@/ui/Button';
import { StepHeader } from '@/features/onboarding/components/StepHeader';
import { InterestChip } from '@/features/onboarding/components/InterestChip';
import { useSaveInterests } from '@/features/onboarding/api/useSaveInterests';
import { t } from '@/lib/i18n';

const OPTIONS: readonly { id: string; emoji: string; label: string }[] = [
  { id: 'fitness', emoji: '💪', label: 'Fitness' },
  { id: 'study', emoji: '📚', label: 'Study' },
  { id: 'habit', emoji: '🧘', label: 'Habit' },
  { id: 'creative', emoji: '🎨', label: 'Creative' },
  { id: 'dare', emoji: '🎲', label: 'Dare' },
];

export default function InterestsStep() {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const mutation = useSaveInterests();

  function toggle(id: string) {
    setPicked((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 5 ? cur : [...cur, id],
    );
  }

  async function next(interests: string[]) {
    try {
      await mutation.mutateAsync(interests);
      router.push('/onboarding/notifications');
    } catch (e) {
      Alert.alert(t('auth.errors.generic'), (e as Error).message);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-1 px-6 pt-8">
        <StepHeader step={2} />
        <Text className="mb-2 font-display text-3xl text-text-primary">
          {t('onboarding.interests.title')}
        </Text>
        <Text className="mb-8 text-base text-text-muted">{t('onboarding.interests.subtitle')}</Text>
        <View className="flex-row flex-wrap gap-3">
          {OPTIONS.map((opt) => (
            <InterestChip
              key={opt.id}
              label={opt.label}
              emoji={opt.emoji}
              selected={picked.includes(opt.id)}
              onToggle={() => toggle(opt.id)}
            />
          ))}
        </View>
      </View>
      <View className="gap-3 px-6 pb-8">
        <Button onPress={() => next(picked)} disabled={mutation.isPending}>
          {t('onboarding.interests.continue')}
        </Button>
        <Button onPress={() => next([])} variant="ghost" disabled={mutation.isPending}>
          {t('onboarding.interests.skip')}
        </Button>
      </View>
    </SafeAreaView>
  );
}
