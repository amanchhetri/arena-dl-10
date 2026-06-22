import { Text, View } from 'react-native';

type Props = { title: string; children: React.ReactNode };

export function SettingsSection({ title, children }: Props) {
  return (
    <View className="mb-6">
      <Text className="mb-2 px-4 text-xs font-semibold tracking-widest text-text-muted">
        {title}
      </Text>
      <View className="mx-0 overflow-hidden rounded-2xl bg-bg-surface">{children}</View>
    </View>
  );
}
