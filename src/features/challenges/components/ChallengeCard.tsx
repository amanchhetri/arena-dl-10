import { Pressable, Text, View } from 'react-native';
import type { ChallengeRow } from '@/types/database';
import { DifficultyBadge } from './DifficultyBadge';
import { ProofTypeIcon } from './ProofTypeIcon';

const categoryEmoji: Record<string, string> = {
  fitness: '💪',
  study: '📚',
  habit: '🧘',
  dare: '🎲',
  creative: '🎨',
  other: '✨',
};

type Props = {
  challenge: ChallengeRow;
  onPress: () => void;
  accepted?: boolean;
  size?: 'full' | 'compact';
};

export function ChallengeCard({ challenge, onPress, accepted = false, size = 'full' }: Props) {
  const isCompact = size === 'compact';

  return (
    <Pressable
      onPress={onPress}
      className={`rounded-2xl bg-bg-surface p-4 active:opacity-80 ${isCompact ? 'w-44' : 'w-full'}`}
    >
      <View className="flex-row items-start justify-between">
        <Text className="text-2xl">{categoryEmoji[challenge.category] ?? '✨'}</Text>
        {accepted && (
          <View className="rounded-full bg-xp-gain/20 px-2 py-0.5">
            <Text className="text-xs font-semibold text-xp-gain">✓ Accepted</Text>
          </View>
        )}
      </View>
      <Text
        className="mt-3 font-display text-base text-text-primary"
        numberOfLines={isCompact ? 2 : 3}
      >
        {challenge.title}
      </Text>
      <View className="mt-3 flex-row items-center gap-2">
        <DifficultyBadge difficulty={challenge.difficulty} />
        <Text className="text-xs text-text-muted">·</Text>
        <Text className="text-xs font-semibold text-text-primary">+{challenge.xp_reward} XP</Text>
        <Text className="text-xs text-text-muted">·</Text>
        <ProofTypeIcon proofType={challenge.proof_type} />
      </View>
    </Pressable>
  );
}
