import { Pressable, Text } from 'react-native';

type Props = { label: string; emoji: string; selected: boolean; onToggle: () => void };

export function InterestChip({ label, emoji, selected, onToggle }: Props) {
  return (
    <Pressable
      onPress={onToggle}
      className={`flex-row items-center gap-2 rounded-full border px-4 py-3 ${
        selected ? 'border-primary-500 bg-primary-500/20' : 'border-bg-elevated bg-bg-elevated'
      }`}
    >
      <Text className="text-base">{emoji}</Text>
      <Text
        className={`text-base ${selected ? 'font-semibold text-text-primary' : 'text-text-muted'}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
