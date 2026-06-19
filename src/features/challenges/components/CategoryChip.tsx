import { Pressable, Text } from 'react-native';

type Props = { label: string; active: boolean; onPress: () => void };

export function CategoryChip({ label, active, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full px-4 py-2 ${active ? 'bg-primary-500' : 'bg-bg-elevated'} active:opacity-80`}
    >
      <Text className={`text-sm font-semibold ${active ? 'text-white' : 'text-text-muted'}`}>
        {label}
      </Text>
    </Pressable>
  );
}
