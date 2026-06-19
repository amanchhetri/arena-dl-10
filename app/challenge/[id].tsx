import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, Text, View } from 'react-native';
import { Button } from '@/ui/Button';
import { DifficultyBadge } from '@/features/challenges/components/DifficultyBadge';
import { ProofTypeIcon } from '@/features/challenges/components/ProofTypeIcon';
import { useChallenge } from '@/features/challenges/api/useChallenge';
import { useMyAccept } from '@/features/challenges/api/useMyAccept';
import { useAcceptChallenge } from '@/features/challenges/api/useAcceptChallenge';
import { analytics } from '@/lib/analytics/client';
import { t } from '@/lib/i18n';

const categoryEmoji: Record<string, string> = {
  fitness: '💪',
  study: '📚',
  habit: '🧘',
  dare: '🎲',
  creative: '🎨',
  other: '✨',
};

export default function ChallengeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: challenge, isLoading } = useChallenge(id);
  const { data: accept } = useMyAccept(id);
  const acceptMutation = useAcceptChallenge();

  useEffect(() => {
    if (challenge) {
      analytics.track('challenge_viewed', {
        challenge_id: challenge.id,
        category: challenge.category,
      });
    }
  }, [challenge]);

  if (isLoading || !challenge) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg-base">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  const state: 'fresh' | 'accepted' | 'completed' =
    accept?.status === 'completed' ? 'completed' : accept ? 'accepted' : 'fresh';

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="px-6 pt-4">
        <Text className="text-base text-text-muted" onPress={() => router.back()}>
          ← back
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 16 }}>
        <View className="items-center">
          <Text className="text-6xl">{categoryEmoji[challenge.category] ?? '✨'}</Text>
          <Text className="mt-4 text-center font-display text-2xl text-text-primary">
            {challenge.title}
          </Text>
          <View className="mt-3 flex-row items-center gap-2">
            <Text className="text-sm capitalize text-text-muted">{challenge.category}</Text>
            <Text className="text-sm text-text-muted">·</Text>
            <DifficultyBadge difficulty={challenge.difficulty} />
            <Text className="text-sm text-text-muted">·</Text>
            <Text className="text-sm font-semibold text-text-primary">
              +{challenge.xp_reward} XP
            </Text>
            <Text className="text-sm text-text-muted">·</Text>
            <ProofTypeIcon proofType={challenge.proof_type} />
          </View>
        </View>
        {challenge.description && (
          <Text className="mt-6 text-center text-base text-text-primary">
            {challenge.description}
          </Text>
        )}
        <Text className="mt-4 text-center text-xs text-text-muted">
          {t(`challenge.proofRequired.${challenge.proof_type}`)}
        </Text>
      </ScrollView>
      <View className="px-6 pb-8">
        {state === 'fresh' && (
          <Button
            disabled={acceptMutation.isPending}
            onPress={async () => {
              try {
                await acceptMutation.mutateAsync({ challenge });
              } catch (e) {
                Alert.alert(t('auth.errors.generic'), (e as Error).message);
              }
            }}
          >
            {t('challenge.accept')}
          </Button>
        )}
        {state === 'accepted' && (
          <Button
            onPress={() => Alert.alert(t('challenge.submitProof'), t('challenge.comingSoon'))}
          >
            {t('challenge.submitProof')}
          </Button>
        )}
        {state === 'completed' && (
          <View className="items-center rounded-2xl bg-xp-gain/10 px-4 py-6">
            <Text className="text-3xl text-xp-gain">✓</Text>
            <Text className="mt-2 font-display text-base text-text-primary">
              {t('challenge.completedToday')}
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
