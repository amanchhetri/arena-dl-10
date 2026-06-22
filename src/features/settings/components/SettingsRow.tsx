import { Pressable, Text, View } from 'react-native';

type Props = {
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  last?: boolean;
  rightSlot?: React.ReactNode;
};

export function SettingsRow({ label, value, onPress, destructive, last, rightSlot }: Props) {
  const Container = onPress ? Pressable : View;
  return (
    <Container
      onPress={onPress}
      className={`flex-row items-center justify-between px-4 py-4 ${
        last ? '' : 'border-b border-bg-elevated'
      } ${onPress ? 'active:bg-bg-elevated' : ''}`}
    >
      <Text className={`text-base ${destructive ? 'text-accent-pink' : 'text-text-primary'}`}>
        {label}
      </Text>
      {rightSlot ?? (value ? <Text className="text-sm text-text-muted">{value}</Text> : null)}
    </Container>
  );
}
