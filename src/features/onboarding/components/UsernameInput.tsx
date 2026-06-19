import { TextInput, View, Text } from 'react-native';
import { useUsernameAvailable } from '../api/useUsernameAvailable';

type Props = { value: string; onChange: (v: string) => void };

export function UsernameInput({ value, onChange }: Props) {
  const { data, isLoading } = useUsernameAvailable(value);
  const status = !value ? null : isLoading ? 'checking' : data?.available ? 'available' : 'taken';

  return (
    <View>
      <View className="flex-row items-center rounded-2xl bg-bg-elevated px-4 py-3">
        <Text className="text-base text-text-muted">@</Text>
        <TextInput
          value={value}
          onChangeText={(v) => onChange(v.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
          placeholder="username"
          placeholderTextColor="#8B8B98"
          className="ml-1 flex-1 text-base text-text-primary"
        />
      </View>
      <Text className="mt-2 text-xs text-text-muted">3–20 chars · a–z, 0–9, _</Text>
      {status === 'checking' && <Text className="mt-1 text-xs text-text-muted">Checking…</Text>}
      {status === 'available' && <Text className="mt-1 text-xs text-xp-gain">✓ Available</Text>}
      {status === 'taken' && <Text className="mt-1 text-xs text-accent-pink">Already taken</Text>}
    </View>
  );
}
