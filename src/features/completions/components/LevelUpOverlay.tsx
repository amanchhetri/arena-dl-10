import { useEffect } from 'react';
import { Pressable, Text } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useMotionDurations } from '@/lib/motion';

type Props = { level: number; visible: boolean; onDismiss: () => void };

export function LevelUpOverlay({ level, visible, onDismiss }: Props) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.8);
  const { medium, long } = useMotionDurations();

  useEffect(() => {
    if (!visible) return;
    opacity.value = withTiming(1, { duration: medium });
    scale.value = withSequence(
      withTiming(1.1, { duration: medium, easing: Easing.out(Easing.back(1.5)) }),
      withTiming(1, { duration: long }),
    );
  }, [visible, opacity, scale, medium, long]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const contentStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  if (!visible) return null;
  return (
    <Pressable onPress={onDismiss} className="absolute inset-0">
      <Animated.View
        style={overlayStyle}
        className="flex-1 items-center justify-center bg-black/80"
      >
        <Animated.View style={contentStyle} className="items-center">
          <Text className="text-7xl">🎉</Text>
          <Text className="mt-4 font-display text-4xl text-primary-500">Level {level}!</Text>
          <Text className="mt-4 text-xs text-text-muted">Tap to dismiss</Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}
