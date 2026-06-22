import type { ErrorBoundaryProps } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { t } from '@/lib/i18n';

export default function RouterErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View className="flex-1 items-center justify-center bg-bg-base px-6">
      <Text className="mb-3 font-display text-2xl text-text-primary">
        {t('errors.boundary.title')}
      </Text>
      <Text className="mb-2 text-center text-base text-text-muted">
        {t('errors.boundary.body')}
      </Text>
      <Text className="mb-8 text-center text-xs text-text-muted">{error.message}</Text>
      <Pressable onPress={retry} className="rounded-2xl bg-primary-500 px-6 py-3">
        <Text className="text-base font-semibold text-white">{t('errors.boundary.reload')}</Text>
      </Pressable>
    </View>
  );
}
