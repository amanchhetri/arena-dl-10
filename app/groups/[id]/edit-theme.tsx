import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, SafeAreaView, Text, View } from 'react-native';
import { Button } from '@/ui/Button';
import { ThemePicker } from '@/features/groups/components/ThemePicker';
import { useGroup } from '@/features/groups/api/useGroup';
import { useUpdateGroup } from '@/features/groups/api/useUpdateGroup';
import { t } from '@/lib/i18n';
import type { GroupTheme } from '@/types/database';

export default function EditTheme() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: group } = useGroup(id);
  const [theme, setTheme] = useState<GroupTheme>(group?.theme ?? 'purple');
  const mutation = useUpdateGroup();

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-1 px-6 pt-8">
        <Text className="mb-6 font-display text-2xl text-text-primary">
          {t('groups.edit.themeTitle')}
        </Text>
        <ThemePicker value={theme} onChange={setTheme} />
      </View>
      <View className="px-6 pb-8">
        <Button
          disabled={mutation.isPending}
          onPress={async () => {
            try {
              await mutation.mutateAsync({ group_id: id, theme });
              router.back();
            } catch (e) {
              Alert.alert(t('auth.errors.generic'), (e as Error).message);
            }
          }}
        >
          {t('groups.edit.save')}
        </Button>
      </View>
    </SafeAreaView>
  );
}
