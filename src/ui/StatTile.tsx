import { Text, View } from 'react-native';

type Props = { value: string | number; label: string; accent?: 'default' | 'flame' };

export function StatTile({ value, label, accent = 'default' }: Props) {
  return (
    <View className="flex-1 items-center rounded-2xl bg-bg-surface px-4 py-4">
      <Text
        className={`font-display text-2xl ${
          accent === 'flame' ? 'text-flame-from' : 'text-text-primary'
        }`}
      >
        {value}
      </Text>
      <Text className="mt-1 text-xs text-text-muted">{label}</Text>
    </View>
  );
}
