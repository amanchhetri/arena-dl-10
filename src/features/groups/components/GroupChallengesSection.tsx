import { Pressable, Text, View } from 'react-native';
import { ChallengeCard } from '@/features/challenges/components/ChallengeCard';
import { useGroupChallenges } from '../api/useGroupChallenges';
import { t } from '@/lib/i18n';

type Props = {
  groupId: string;
  onChallengePress: (challengeId: string) => void;
  onSeeAll: () => void;
  onCreateFirst: () => void;
};

export function GroupChallengesSection({
  groupId,
  onChallengePress,
  onSeeAll,
  onCreateFirst,
}: Props) {
  const { data: challenges } = useGroupChallenges(groupId);

  if (!challenges) return null;

  if (challenges.length === 0) {
    return (
      <View className="items-center rounded-2xl bg-bg-surface px-4 py-6">
        <Text className="mb-2 text-3xl">✨</Text>
        <Text className="mb-3 text-sm text-text-muted">{t('groupChallenges.empty.label')}</Text>
        <Pressable
          onPress={onCreateFirst}
          className="rounded-full bg-primary-500 px-4 py-2 active:opacity-80"
        >
          <Text className="text-sm font-semibold text-white">{t('groupChallenges.empty.cta')}</Text>
        </Pressable>
      </View>
    );
  }

  const preview = challenges.slice(0, 3);

  return (
    <View>
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-xs font-semibold tracking-widest text-text-muted">
          {t('groupChallenges.section.title')}
        </Text>
        <Text className="text-xs text-text-muted">{challenges.length}</Text>
      </View>
      <View className="gap-3">
        {preview.map((c) => (
          <ChallengeCard key={c.id} challenge={c} onPress={() => onChallengePress(c.id)} />
        ))}
      </View>
      {challenges.length > 3 && (
        <Pressable onPress={onSeeAll} className="mt-3 self-end active:opacity-60">
          <Text className="text-sm font-semibold text-primary-500">
            {t('groupChallenges.section.seeAll', { count: challenges.length })}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
