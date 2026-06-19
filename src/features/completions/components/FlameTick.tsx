import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useMotionDurations } from '@/lib/motion';

type Props = { streak: number; pulse: boolean };

export function FlameTick({ streak, pulse }: Props) {
  const scale = useSharedValue(1);
  const { short, medium } = useMotionDurations();

  useEffect(() => {
    if (!pulse) return;
    scale.value = withSequence(
      withTiming(1.35, { duration: short }),
      withTiming(1, { duration: medium }),
    );
  }, [pulse, scale, short, medium]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={style} className="flex-row items-center gap-2">
      <Text className="text-4xl">🔥</Text>
      <View>
        <Text className="font-display text-2xl text-text-primary">{streak}</Text>
        <Text className="text-xs text-text-muted">day{streak === 1 ? '' : 's'}</Text>
      </View>
    </Animated.View>
  );
}
