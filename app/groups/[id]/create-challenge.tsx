import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';
import { Button } from '@/ui/Button';
import { CategoryChip } from '@/features/challenges/components/CategoryChip';
import { DifficultyPicker } from '@/features/groups/components/DifficultyPicker';
import { useCreateGroupChallenge } from '@/features/groups/api/useCreateGroupChallenge';
import { t } from '@/lib/i18n';
import type { Category, Difficulty } from '@/types/database';

const CATEGORIES: { id: Category; labelKey: string }[] = [
  { id: 'fitness', labelKey: 'catalog.fitness' },
  { id: 'study', labelKey: 'catalog.study' },
  { id: 'habit', labelKey: 'catalog.habit' },
  { id: 'dare', labelKey: 'catalog.dare' },
  { id: 'creative', labelKey: 'catalog.creative' },
];

export default function CreateChallenge() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [proofType, setProofType] = useState<'honor' | 'photo'>('honor');
  const mutation = useCreateGroupChallenge();

  const canSubmit =
    title.trim().length > 0 && category != null && difficulty != null && !mutation.isPending;

  function mapError(e: Error): string {
    const code = (e as unknown as { code?: string }).code;
    if (code === '42501') return t('groupChallenges.errors.notMember');
    if (code === '0A000') {
      return proofType === 'honor'
        ? t('groupChallenges.errors.videoNotSupported')
        : t('groupChallenges.errors.peerNotSupported');
    }
    return e.message;
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <ScrollView contentContainerStyle={{ padding: 24, gap: 20 }}>
        <Text className="font-display text-2xl text-text-primary">
          {t('groupChallenges.create.title')}
        </Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={t('groupChallenges.create.titlePlaceholder')}
          placeholderTextColor="#8B8B98"
          maxLength={80}
          autoFocus
          className="rounded-2xl bg-bg-surface px-4 py-3 text-base text-text-primary"
        />
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder={t('groupChallenges.create.descriptionPlaceholder')}
          placeholderTextColor="#8B8B98"
          maxLength={500}
          multiline
          numberOfLines={3}
          className="rounded-2xl bg-bg-surface px-4 py-3 text-base text-text-primary"
        />
        <View>
          <Text className="mb-3 text-xs font-semibold tracking-widest text-text-muted">
            {t('groupChallenges.create.categoryLabel')}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {CATEGORIES.map((c) => (
              <CategoryChip
                key={c.id}
                label={t(c.labelKey)}
                active={category === c.id}
                onPress={() => setCategory(c.id)}
              />
            ))}
          </ScrollView>
        </View>
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
      <View className="px-6 pb-8">
        <Button
          disabled={!canSubmit}
          onPress={async () => {
            try {
              await mutation.mutateAsync({
                group_id: id,
                title,
                description: description.trim() || null,
                category: category!,
                difficulty: difficulty!,
                proof_type: proofType,
              });
              router.replace(`/groups/${id}/catalog`);
            } catch (e) {
              Alert.alert(t('auth.errors.generic'), mapError(e as Error));
            }
          }}
        >
          {t('groupChallenges.create.submit')}
        </Button>
      </View>
    </SafeAreaView>
  );
}
