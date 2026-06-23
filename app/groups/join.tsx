import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, SafeAreaView, Text, TextInput, View } from 'react-native';
import { Button } from '@/ui/Button';
import { useJoinGroup } from '@/features/groups/api/useJoinGroup';
import { t } from '@/lib/i18n';

export default function JoinGroup() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const mutation = useJoinGroup();

  function normalize(v: string): string {
    return v
      .toUpperCase()
      .replace(/[^A-HJ-NP-Z2-9]/g, '')
      .slice(0, 6);
  }

  async function handlePaste() {
    const text = await Clipboard.getStringAsync();
    const stripped = text.replace(/^ARENA-/i, '');
    setCode(normalize(stripped));
  }

  function mapError(e: Error): string {
    const code = (e as unknown as { code?: string }).code;
    if (code === '54023') return t('groups.errors.tooManyGroups');
    if (code === '54024') return t('groups.errors.groupFull');
    if (code === '02000') return t('groups.errors.codeNotFound');
    return e.message;
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-1 px-6 pt-8">
        <Text className="mb-2 font-display text-2xl text-text-primary">
          {t('groups.join.title')}
        </Text>
        <Text className="mb-8 text-base text-text-muted">{t('groups.join.prompt')}</Text>
        <View className="mb-4 flex-row items-center rounded-2xl bg-bg-surface px-4 py-3">
          <Text className="font-display text-lg text-text-muted">ARENA-</Text>
          <TextInput
            value={code}
            onChangeText={(v) => setCode(normalize(v))}
            placeholder={t('groups.join.codePlaceholder')}
            placeholderTextColor="#8B8B98"
            autoCapitalize="characters"
            autoCorrect={false}
            className="ml-1 flex-1 font-display text-lg text-text-primary"
          />
        </View>
        <View className="self-start">
          <Button variant="ghost" onPress={handlePaste}>
            {t('groups.join.paste')}
          </Button>
        </View>
      </View>
      <View className="px-6 pb-8">
        <Button
          disabled={mutation.isPending || code.length !== 6}
          onPress={async () => {
            try {
              const result = await mutation.mutateAsync({ invite_code: `ARENA-${code}` });
              router.replace(`/groups/${result.group_id}`);
            } catch (e) {
              Alert.alert(t('auth.errors.generic'), mapError(e as Error));
            }
          }}
        >
          {t('groups.join.button')}
        </Button>
      </View>
    </SafeAreaView>
  );
}
