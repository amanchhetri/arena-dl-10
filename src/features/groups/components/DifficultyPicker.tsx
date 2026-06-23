import { Pressable, Text, View } from 'react-native';
import type { Difficulty } from '@/types/database';
import { t } from '@/lib/i18n';

const TIERS: { difficulty: Difficulty; xp: number }[] = [
  { difficulty: 'easy', xp: 30 },
  { difficulty: 'medium', xp: 50 },
  { difficulty: 'hard', xp: 70 },
  { difficulty: 'epic', xp: 120 },
];

type Props = { value: Difficulty | null; onChange: (d: Difficulty) => void };

export function DifficultyPicker({ value, onChange }: Props) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {TIERS.map(({ difficulty, xp }) => {
        const active = value === difficulty;
        return (
          <Pressable
            key={difficulty}
            onPress={() => onChange(difficulty)}
            className={`rounded-2xl px-4 py-3 ${
              active ? 'bg-primary-500' : 'bg-bg-elevated'
            } active:opacity-80`}
          >
            <Text
              className={`text-sm font-semibold ${active ? 'text-white' : 'text-text-primary'}`}
            >
              {t(`groupChallenges.difficulty.${difficulty}`)}
            </Text>
            <Text className={`text-xs ${active ? 'text-white/80' : 'text-text-muted'}`}>
              {t('groupChallenges.difficulty.xpPreview', { xp })}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
