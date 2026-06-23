import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, SafeAreaView, Text, TextInput, View } from 'react-native';
import { Button } from '@/ui/Button';
import { useGroup } from '@/features/groups/api/useGroup';
import { useUpdateGroup } from '@/features/groups/api/useUpdateGroup';
import { t } from '@/lib/i18n';

export default function EditName() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: group } = useGroup(id);
  const [name, setName] = useState(group?.name ?? '');
  const mutation = useUpdateGroup();

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-1 px-6 pt-8">
        <Text className="mb-6 font-display text-2xl text-text-primary">
          {t('groups.edit.nameTitle')}
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          maxLength={40}
          placeholderTextColor="#8B8B98"
          className="rounded-2xl bg-bg-surface px-4 py-3 text-base text-text-primary"
        />
      </View>
      <View className="px-6 pb-8">
        <Button
          disabled={mutation.isPending || name.trim().length < 1}
          onPress={async () => {
            try {
              await mutation.mutateAsync({ group_id: id, name });
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
