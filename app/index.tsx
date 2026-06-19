import { SafeAreaView, Text, View } from 'react-native';
import { Button } from '@/ui/Button';
import { t } from '@/lib/i18n';

export default function Index() {
  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="mb-2 font-display text-4xl text-text-primary">{t('app.name')}</Text>
        <Text className="mb-12 text-center text-base text-text-muted">{t('app.tagline')}</Text>

        <View className="w-full gap-3">
          <Button onPress={() => {}}>{t('signIn.continueWithApple')}</Button>
          <Button onPress={() => {}}>{t('signIn.continueWithGoogle')}</Button>
          <Button onPress={() => {}} variant="ghost">
            {t('signIn.continueWithEmail')}
          </Button>
        </View>
      </View>
      <View className="flex-row justify-center gap-4 pb-8">
        <Text className="text-xs text-text-muted">{t('legal.terms')}</Text>
        <Text className="text-xs text-text-muted">·</Text>
        <Text className="text-xs text-text-muted">{t('legal.privacy')}</Text>
      </View>
    </SafeAreaView>
  );
}
