import { useReducedMotion } from 'react-native-reanimated';

export function useMotionDurations() {
  const reduced = useReducedMotion();
  return {
    short: reduced ? 0 : 200,
    medium: reduced ? 0 : 400,
    long: reduced ? 0 : 800,
    countUp: reduced ? 0 : 1200,
  };
}
