import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Button } from '@/ui/Button';
import { DifficultyBadge } from '@/features/challenges/components/DifficultyBadge';
import { ProofTypeIcon } from '@/features/challenges/components/ProofTypeIcon';
import { useChallenge } from '@/features/challenges/api/useChallenge';
import { useMyAccept } from '@/features/challenges/api/useMyAccept';
import { useAcceptChallenge } from '@/features/challenges/api/useAcceptChallenge';
import { useSubmitCompletion } from '@/features/completions/api/useSubmitCompletion';
import {
  ProofPickCancelled,
  useUploadProofPhoto,
} from '@/features/completions/api/useUploadProofPhoto';
import { useMyCompletion } from '@/features/completions/api/useMyCompletion';
import { useSignedProofUrl } from '@/features/completions/api/useSignedProofUrl';
import { ProofSubmitSheet } from '@/features/completions/components/ProofSubmitSheet';
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
  const submitMutation = useSubmitCompletion();
  const uploadMutation = useUploadProofPhoto();
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: completion } = useMyCompletion(accept?.id);
  const { data: signedUrl } = useSignedProofUrl(completion?.proof_url ?? null);

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

  async function finalize(proofUrl: string | null) {
    if (!accept) return;
    try {
      const result = await submitMutation.mutateAsync({
        acceptId: accept.id,
        challengeId: challenge!.id,
        proofUrl,
        proofType: challenge!.proof_type as 'honor' | 'photo',
      });
      setSheetOpen(false);
      router.push({
        pathname: '/challenge/[id]/celebrate',
        params: {
          id: challenge!.id,
          xp: String(result.xp_awarded),
          newTotal: String(result.new_total_xp),
          newLevel: String(result.new_level),
          levelChanged: result.level_changed ? '1' : '0',
          newStreak: String(result.new_streak),
          streakChanged: result.streak_changed ? '1' : '0',
        },
      });
    } catch (e) {
      Alert.alert(t('auth.errors.generic'), (e as Error).message);
    }
  }

  async function handleHonor() {
    analytics.track('proof_submission_started', {
      accept_id: accept!.id,
      proof_type: 'honor',
    });
    await finalize(null);
  }

  async function handlePickPhoto() {
    if (!accept) return;
    try {
      const proofUrl = await uploadMutation.mutateAsync({ acceptId: accept.id });
      await finalize(proofUrl);
    } catch (e) {
      if (e instanceof ProofPickCancelled) {
        Alert.alert(t('proof.errors.cancelled'));
        return;
      }
      Alert.alert(t('auth.errors.generic'), (e as Error).message);
    }
  }

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

        {state === 'completed' && (
          <View className="mt-6 items-center rounded-2xl bg-xp-gain/10 px-4 py-6">
            <Text className="text-3xl text-xp-gain">✓</Text>
            <Text className="mt-2 font-display text-base text-text-primary">
              {t('challenge.completedToday')}
            </Text>
            <Text className="mt-1 text-xs text-text-muted">+{completion?.xp_awarded ?? 0} XP</Text>
            {signedUrl && (
              <Image
                source={{ uri: signedUrl }}
                className="mt-4 h-48 w-48 rounded-2xl"
                resizeMode="cover"
              />
            )}
          </View>
        )}
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
            onPress={() => setSheetOpen(true)}
            disabled={submitMutation.isPending || uploadMutation.isPending}
          >
            {t('challenge.submitProof')}
          </Button>
        )}
      </View>

      <ProofSubmitSheet
        visible={sheetOpen}
        proofType={challenge.proof_type}
        onClose={() => setSheetOpen(false)}
        onSubmitHonor={handleHonor}
        onPickPhoto={handlePickPhoto}
        busy={submitMutation.isPending || uploadMutation.isPending}
      />
    </SafeAreaView>
  );
}
