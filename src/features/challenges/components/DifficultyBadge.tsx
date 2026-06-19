import { Text, View } from 'react-native';
import type { Difficulty } from '@/types/database';

const bgClass: Record<Difficulty, string> = {
  easy: 'bg-xp-gain/20',
  medium: 'bg-accent-cyan/20',
  hard: 'bg-flame-from/20',
  epic: 'bg-primary-500/20',
};

const textClass: Record<Difficulty, string> = {
  easy: 'text-xp-gain',
  medium: 'text-accent-cyan',
  hard: 'text-flame-from',
  epic: 'text-primary-500',
};

const label: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  epic: 'Epic',
};

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  return (
    <View className={`rounded-full px-2 py-0.5 ${bgClass[difficulty]}`}>
      <Text className={`text-xs font-semibold ${textClass[difficulty]}`}>{label[difficulty]}</Text>
    </View>
  );
}
