import { Pressable, Text, View } from 'react-native';
import { ThemeAccent } from './ThemeAccent';
import type { GroupRow } from '@/types/database';

type Props = { group: GroupRow; onPress: () => void };

export function GroupCard({ group, onPress }: Props) {
  return (
    <Pressable onPress={onPress} className="rounded-2xl bg-bg-surface p-4 active:opacity-80">
      <View className="flex-row items-center gap-3">
        <ThemeAccent theme={group.theme} size={16} />
        <View className="flex-1">
          <Text className="font-display text-lg text-text-primary">{group.name}</Text>
          <Text className="text-xs text-text-muted">{group.member_count} of 25 members</Text>
        </View>
        <View className="rounded-full bg-bg-elevated px-3 py-1">
          <Text className="text-xs font-semibold text-text-muted">{group.invite_code}</Text>
        </View>
      </View>
    </Pressable>
  );
}
