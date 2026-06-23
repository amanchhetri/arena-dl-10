import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, SafeAreaView, Text, TextInput, View } from 'react-native';
import { Button } from '@/ui/Button';
import { ThemePicker } from '@/features/groups/components/ThemePicker';
import { useCreateGroup } from '@/features/groups/api/useCreateGroup';
import { t } from '@/lib/i18n';
import type { GroupTheme } from '@/types/database';

export default function CreateGroup() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [theme, setTheme] = useState<GroupTheme>('purple');
  const mutation = useCreateGroup();

  function mapError(e: Error): string {
    const code = (e as unknown as { code?: string }).code;
    if (code === '54023') return t('groups.errors.tooManyGroups');
    return e.message;
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-1 px-6 pt-8">
        <Text className="mb-6 font-display text-2xl text-text-primary">
          {t('groups.create.title')}
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('groups.create.namePlaceholder')}
          placeholderTextColor="#8B8B98"
          maxLength={40}
          className="mb-6 rounded-2xl bg-bg-surface px-4 py-3 text-base text-text-primary"
        />
        <Text className="mb-3 text-xs font-semibold tracking-widest text-text-muted">
          {t('groups.create.themeLabel')}
        </Text>
        <ThemePicker value={theme} onChange={setTheme} />
      </View>
      <View className="px-6 pb-8">
        <Button
          disabled={mutation.isPending || name.trim().length < 1}
          onPress={async () => {
            try {
              const result = await mutation.mutateAsync({ name, theme });
              router.replace(`/groups/${result.group_id}`);
            } catch (e) {
              Alert.alert(t('auth.errors.generic'), mapError(e as Error));
            }
          }}
        >
          {t('groups.create.button')}
        </Button>
      </View>
    </SafeAreaView>
  );
}
