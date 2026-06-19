import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useMotionDurations } from '@/lib/motion';

type Props = { from: number; to: number; className?: string };

export function XPCounter({ from, to, className }: Props) {
  const value = useSharedValue(from);
  const [displayed, setDisplayed] = useState(from);
  const { countUp } = useMotionDurations();

  useEffect(() => {
    value.value = withTiming(to, { duration: countUp, easing: Easing.out(Easing.cubic) });
  }, [to, value, countUp]);

  useAnimatedReaction(
    () => Math.round(value.value),
    (current, previous) => {
      if (current !== previous) {
        runOnJS(setDisplayed)(current);
      }
    },
  );

  return <Text className={className ?? 'font-display text-6xl text-xp-gain'}>{displayed} XP</Text>;
}
