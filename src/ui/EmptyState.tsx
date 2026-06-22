import { Pressable, Text, View } from 'react-native';

type Props = {
  emoji: string;
  label: string;
  cta?: { label: string; onPress: () => void };
};

export function EmptyState({ emoji, label, cta }: Props) {
  return (
    <View className="items-center px-6 py-8">
      <Text className="mb-3 text-5xl">{emoji}</Text>
      <Text className="mb-4 text-center text-base text-text-muted">{label}</Text>
      {cta && (
        <Pressable
          onPress={cta.onPress}
          className="rounded-full bg-primary-500 px-6 py-3 active:opacity-80"
        >
          <Text className="text-base font-semibold text-white">{cta.label}</Text>
        </Pressable>
      )}
    </View>
  );
}
