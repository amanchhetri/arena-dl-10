import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, SafeAreaView, Text, View } from 'react-native';
import { t } from '@/lib/i18n';
import { useSignInWithEmail } from '@/features/auth/api/useSignInWithEmail';

export default function EmailSent() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const router = useRouter();
  const [canResend, setCanResend] = useState(true);
  const mutation = useSignInWithEmail();

  useEffect(() => {
    if (canResend) return;
    const id = setTimeout(() => setCanResend(true), 30_000);
    return () => clearTimeout(id);
  }, [canResend]);

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="mb-4 text-5xl">✉️</Text>
        <Text className="mb-3 font-display text-2xl text-text-primary">
          {t('auth.emailSentTitle')}
        </Text>
        <Text className="mb-8 text-center text-base text-text-muted">
          {t('auth.emailSentBody', { email: email ?? '' })}
        </Text>
        <Pressable
          disabled={!canResend || mutation.isPending}
          onPress={async () => {
            await mutation.mutateAsync(email ?? '');
            setCanResend(false);
          }}
          className="mb-4"
        >
          <Text
            className={`text-base font-semibold ${canResend ? 'text-primary-500' : 'text-text-muted'}`}
          >
            {t('auth.resend')}
          </Text>
        </Pressable>
        <Pressable onPress={() => router.back()}>
          <Text className="text-base text-text-muted">{t('auth.useDifferentEmail')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
