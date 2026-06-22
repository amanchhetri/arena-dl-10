import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, SafeAreaView, Text, TextInput, View } from 'react-native';
import { Button } from '@/ui/Button';
import { useAuthStore } from '@/features/auth/store';
import { useUpdateDisplayName } from '@/features/settings/api/useUpdateDisplayName';
import { t } from '@/lib/i18n';

export default function DisplayNameEdit() {
  const router = useRouter();
  const current = useAuthStore((s) => s.profile?.display_name ?? '');
  const [value, setValue] = useState(current);
  const mutation = useUpdateDisplayName();

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-1 px-6 pt-8">
        <Text className="mb-6 font-display text-2xl text-text-primary">
          {t('settings.displayName.title')}
        </Text>
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder={t('settings.displayName.placeholder')}
          placeholderTextColor="#8B8B98"
          maxLength={40}
          className="rounded-2xl bg-bg-surface px-4 py-3 text-base text-text-primary"
        />
      </View>
      <View className="px-6 pb-8">
        <Button
          disabled={mutation.isPending || value.trim().length < 1}
          onPress={async () => {
            try {
              await mutation.mutateAsync(value);
              router.back();
            } catch (e) {
              Alert.alert(t('auth.errors.generic'), (e as Error).message);
            }
          }}
        >
          {t('settings.displayName.save')}
        </Button>
      </View>
    </SafeAreaView>
  );
}
