import { useRouter } from 'expo-router';
import { Pressable, SafeAreaView, Text, View } from 'react-native';
import { Button } from '@/ui/Button';
import { StatTile } from '@/ui/StatTile';
import { useAuthStore } from '@/features/auth/store';
import { useSignOut } from '@/features/auth/api/useSignOut';
import { useMyAccepts } from '@/features/challenges/api/useMyAccepts';
import { useShareProfile } from '@/features/share/api/useShareProfile';
import { levelFromXp } from '@/lib/challenge';
import { t } from '@/lib/i18n';

export default function ProfileTab() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const signOut = useSignOut();
  const shareProfile = useShareProfile();
  const { data: completed } = useMyAccepts('completed');

  const level = levelFromXp(Number(profile?.total_xp ?? 0));
  const longest = profile?.longest_streak ?? 0;
  const longestLabel =
    longest === 1
      ? t('profile.stats.longest', { n: 1 })
      : t('profile.stats.longestPlural', { n: longest });

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-1 px-6 pt-8">
        <View className="items-center">
          <View className="h-24 w-24 items-center justify-center rounded-full bg-primary-500/30">
            <Text className="text-4xl">{(profile?.username ?? '?').slice(0, 1).toUpperCase()}</Text>
          </View>
          <Text className="mt-4 font-display text-2xl text-text-primary">
            @{profile?.username ?? '...'}
          </Text>
          <Text className="mt-1 text-sm text-text-muted">{t('home.level', { level })}</Text>
        </View>

        <View className="mt-8 flex-row gap-3">
          <StatTile value={profile?.total_xp ?? 0} label={t('profile.stats.xp')} />
          <StatTile
            value={`${profile?.current_streak ?? 0} 🔥`}
            label={t('profile.stats.streak')}
            accent="flame"
          />
          <StatTile value={(completed ?? []).length} label={t('profile.stats.completed')} />
        </View>

        <Text className="mt-4 text-center text-xs text-text-muted">{longestLabel}</Text>
      </View>
      <View className="gap-3 px-6 pb-8">
        <Pressable
          onPress={() => router.push('/settings')}
          className="items-center rounded-2xl bg-bg-surface px-4 py-3 active:opacity-80"
        >
          <Text className="text-base font-semibold text-text-primary">{t('settings.title')}</Text>
        </Pressable>
        <Button
          variant="ghost"
          onPress={() => shareProfile.mutate()}
          disabled={shareProfile.isPending}
        >
          {t('share.profile.button')}
        </Button>
        <Button variant="ghost" onPress={() => signOut.mutate()}>
          {t('auth.signOut')}
        </Button>
      </View>
    </SafeAreaView>
  );
}
