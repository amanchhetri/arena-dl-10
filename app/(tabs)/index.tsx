import { SafeAreaView, Text, View } from 'react-native';
import { Button } from '@/ui/Button';
import { useAuthStore } from '@/features/auth/store';
import { useSignOut } from '@/features/auth/api/useSignOut';
import { t } from '@/lib/i18n';

export default function Home() {
  const profile = useAuthStore((s) => s.profile);
  const signOut = useSignOut();

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="mb-2 font-display text-2xl text-text-primary">
          Hey @{profile?.username ?? '...'}
        </Text>
        <Text className="text-base text-text-muted">Plan 3 fills this out.</Text>
      </View>
      <View className="px-6 pb-8">
        <Button variant="ghost" onPress={() => signOut.mutate()}>
          {t('auth.signOut')}
        </Button>
      </View>
    </SafeAreaView>
  );
}
