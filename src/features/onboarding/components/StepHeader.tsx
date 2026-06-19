import { Text, View } from 'react-native';
import { t } from '@/lib/i18n';

export function StepHeader({ step }: { step: 1 | 2 | 3 }) {
  return (
    <View className="mb-8 flex-row items-center justify-between">
      <Text className="text-sm text-text-muted">{t('onboarding.stepOf', { step, total: 3 })}</Text>
      <View className="flex-row gap-2">
        {[1, 2, 3].map((n) => (
          <View
            key={n}
            className={`h-2 w-2 rounded-full ${n <= step ? 'bg-primary-500' : 'bg-bg-elevated'}`}
          />
        ))}
      </View>
    </View>
  );
}
