import { ActivityIndicator, Pressable, Text, View } from 'react-native';

type Provider = 'apple' | 'google' | 'email';

const iconForProvider: Record<Provider, string> = {
  apple: '',
  google: 'G',
  email: '✉',
};

const bgClassForProvider: Record<Provider, string> = {
  apple: 'bg-white/95',
  google: 'bg-bg-elevated',
  email: 'bg-transparent border border-bg-elevated',
};

const labelClassForProvider: Record<Provider, string> = {
  apple: 'text-black',
  google: 'text-text-primary',
  email: 'text-text-primary',
};

type Props = {
  provider: Provider;
  label: string;
  onPress: () => void;
  busy?: boolean;
};

export function ProviderButton({ provider, label, onPress, busy }: Props) {
  return (
    <Pressable
      onPress={busy ? undefined : onPress}
      className={`items-center justify-center rounded-2xl px-6 py-4 ${bgClassForProvider[provider]} ${
        busy ? 'opacity-60' : 'active:opacity-80'
      }`}
    >
      <View className="flex-row items-center justify-center gap-3">
        {busy ? (
          <ActivityIndicator />
        ) : (
          <Text className={`text-base font-semibold ${labelClassForProvider[provider]}`}>
            {iconForProvider[provider]}
          </Text>
        )}
        <Text className={`text-base font-semibold ${labelClassForProvider[provider]}`}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
