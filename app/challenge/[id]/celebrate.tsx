import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { SafeAreaView, Text, View } from 'react-native';
import { Button } from '@/ui/Button';
import { XPCounter } from '@/features/completions/components/XPCounter';
import { FlameTick } from '@/features/completions/components/FlameTick';
import { LevelUpOverlay } from '@/features/completions/components/LevelUpOverlay';
import { haptics } from '@/lib/haptics';

export default function Celebrate() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    xp: string;
    newTotal: string;
    newLevel: string;
    levelChanged: string;
    newStreak: string;
    streakChanged: string;
  }>();

  const xp = Number(params.xp ?? 0);
  const newTotal = Number(params.newTotal ?? 0);
  const newLevel = Number(params.newLevel ?? 1);
  const levelChanged = params.levelChanged === '1';
  const newStreak = Number(params.newStreak ?? 0);
  const streakChanged = params.streakChanged === '1';

  const [showLevelUp, setShowLevelUp] = useState(false);

  useEffect(() => {
    void haptics.success();
    if (levelChanged) {
      const id = setTimeout(() => {
        void haptics.notification();
        setShowLevelUp(true);
      }, 1300);
      return () => clearTimeout(id);
    }
  }, [levelChanged]);

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="mb-4 text-6xl">🎉</Text>
        <XPCounter from={newTotal - xp} to={newTotal} />
        <Text className="mt-2 text-base text-text-muted">+{xp} XP earned</Text>
        <View className="mt-10">
          <FlameTick streak={newStreak} pulse={streakChanged} />
        </View>
      </View>
      <View className="px-6 pb-8">
        <Button onPress={() => router.replace('/(tabs)')}>Continue</Button>
      </View>
      <LevelUpOverlay
        level={newLevel}
        visible={showLevelUp}
        onDismiss={() => setShowLevelUp(false)}
      />
    </SafeAreaView>
  );
}
