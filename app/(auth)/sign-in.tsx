import { useRouter } from 'expo-router';
import { Alert, Platform, SafeAreaView, Text, View } from 'react-native';
import { ProviderButton } from '@/features/auth/components/ProviderButton';
import { useSignInWithEmail } from '@/features/auth/api/useSignInWithEmail';
import { t } from '@/lib/i18n';

export default function SignIn() {
  const router = useRouter();
  const emailMutation = useSignInWithEmail();

  function handleEmail() {
    if (Platform.OS !== 'ios') {
      Alert.alert(
        'Coming soon',
        'Cross-platform email input lands in a follow-up; use the iOS simulator or device for now.',
      );
      return;
    }
    Alert.prompt(
      t('signIn.continueWithEmail'),
      t('auth.emailPlaceholder'),
      async (input?: string) => {
        if (!input) return;
        try {
          const email = await emailMutation.mutateAsync(input);
          router.push({ pathname: '/(auth)/email-sent', params: { email } });
        } catch (e) {
          Alert.alert(t('auth.errors.generic'), (e as Error).message);
        }
      },
      'plain-text',
      '',
      'email-address',
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="mb-2 font-display text-4xl text-text-primary">{t('app.name')}</Text>
        <Text className="mb-12 text-center text-base text-text-muted">{t('app.tagline')}</Text>

        <View className="w-full gap-3">
          <ProviderButton
            provider="apple"
            label={t('signIn.continueWithApple')}
            onPress={() =>
              Alert.alert(
                'Coming soon',
                'Apple Sign In lands once Apple Developer config is set up.',
              )
            }
          />
          <ProviderButton
            provider="google"
            label={t('signIn.continueWithGoogle')}
            onPress={() =>
              Alert.alert(
                'Coming soon',
                'Google Sign In lands once OAuth client IDs are added to .env.local.',
              )
            }
          />
          <ProviderButton
            provider="email"
            label={t('signIn.continueWithEmail')}
            onPress={handleEmail}
            busy={emailMutation.isPending}
          />
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
