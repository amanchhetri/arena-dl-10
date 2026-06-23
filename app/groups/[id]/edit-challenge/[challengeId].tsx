import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button } from '@/ui/Button';
import { DifficultyPicker } from '@/features/groups/components/DifficultyPicker';
import { useChallenge } from '@/features/challenges/api/useChallenge';
import { useGroupMembers } from '@/features/groups/api/useGroupMembers';
import { useUpdateGroupChallenge } from '@/features/groups/api/useUpdateGroupChallenge';
import { useDeleteGroupChallenge } from '@/features/groups/api/useDeleteGroupChallenge';
import { useAuthStore } from '@/features/auth/store';
import { t } from '@/lib/i18n';
import type { Difficulty } from '@/types/database';

export default function EditChallenge() {
  const { id, challengeId } = useLocalSearchParams<{ id: string; challengeId: string }>();
  const router = useRouter();
  const { data: challenge, isLoading } = useChallenge(challengeId);
  const { data: members } = useGroupMembers(id);
  const userId = useAuthStore((s) => s.session?.user.id);
  const updateMutation = useUpdateGroupChallenge();
  const deleteMutation = useDeleteGroupChallenge();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [proofType, setProofType] = useState<'honor' | 'photo'>('honor');

  useEffect(() => {
    if (!challenge) return;
    // Initializing form state from async-loaded data — the canonical "reset on
    // prop change" use of setState in effect; not a render loop.
    /* eslint-disable react-hooks/set-state-in-effect */
    setTitle(challenge.title);
    setDescription(challenge.description ?? '');
    setDifficulty(challenge.difficulty);
    setProofType(
      challenge.proof_type === 'honor' || challenge.proof_type === 'photo'
        ? challenge.proof_type
        : 'honor',
    );
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [challenge]);

  const isOwner = (members ?? []).some((m) => m.user_id === userId && m.role === 'owner');

  if (isLoading || !challenge) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg-base">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  function mapError(e: Error): string {
    const code = (e as unknown as { code?: string }).code;
    if (code === '42501') return t('groupChallenges.errors.notAuthorized');
    return e.message;
  }

  function confirmDelete() {
    Alert.alert(
      t('groupChallenges.edit.deleteConfirmTitle'),
      t('groupChallenges.edit.deleteConfirmBody'),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: t('groupChallenges.edit.deleteConfirmAction'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({
                challenge_id: challengeId,
                group_id: id,
                by_owner: isOwner,
              });
              router.replace(`/groups/${id}/catalog`);
            } catch (e) {
              Alert.alert(t('auth.errors.generic'), mapError(e as Error));
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <ScrollView contentContainerStyle={{ padding: 24, gap: 20 }}>
        <Text className="font-display text-2xl text-text-primary">
          {t('groupChallenges.edit.title')}
        </Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          maxLength={80}
          className="rounded-2xl bg-bg-surface px-4 py-3 text-base text-text-primary"
        />
        <TextInput
          value={description}
          onChangeText={setDescription}
          maxLength={500}
          multiline
          numberOfLines={3}
          placeholderTextColor="#8B8B98"
          className="rounded-2xl bg-bg-surface px-4 py-3 text-base text-text-primary"
        />
        <View>
          <Text className="mb-3 text-xs font-semibold tracking-widest text-text-muted">
            {t('groupChallenges.create.difficultyLabel')}
          </Text>
          <DifficultyPicker value={difficulty} onChange={setDifficulty} />
        </View>
        <View>
          <Text className="mb-3 text-xs font-semibold tracking-widest text-text-muted">
            {t('groupChallenges.create.proofLabel')}
          </Text>
          <View className="flex-row gap-2">
            {(['honor', 'photo'] as const).map((p) => {
              const active = proofType === p;
              return (
                <Button
                  key={p}
                  variant={active ? 'primary' : 'ghost'}
                  onPress={() => setProofType(p)}
                >
                  {t(`groupChallenges.create.proof${p.charAt(0).toUpperCase() + p.slice(1)}`)}
                </Button>
              );
            })}
          </View>
        </View>
      </ScrollView>
      <View className="gap-3 px-6 pb-8">
        <Button
          disabled={updateMutation.isPending || title.trim().length < 1 || difficulty == null}
          onPress={async () => {
            try {
              await updateMutation.mutateAsync({
                challenge_id: challengeId,
                group_id: id,
                title,
                description: description.trim() || null,
                difficulty: difficulty ?? undefined,
                proof_type: proofType,
              });
              router.back();
            } catch (e) {
              Alert.alert(t('auth.errors.generic'), mapError(e as Error));
            }
          }}
        >
          {t('groupChallenges.edit.save')}
        </Button>
        <Button variant="ghost" onPress={confirmDelete} disabled={deleteMutation.isPending}>
          {t('groupChallenges.edit.delete')}
        </Button>
      </View>
    </SafeAreaView>
  );
}
