import { Pressable, View } from 'react-native';
import { THEME_COLORS } from '@/theme/tokens';
import type { GroupTheme } from '@/types/database';

const THEMES: GroupTheme[] = ['purple', 'pink', 'cyan', 'flame', 'lime', 'gold'];

type Props = { value: GroupTheme; onChange: (theme: GroupTheme) => void };

export function ThemePicker({ value, onChange }: Props) {
  return (
    <View className="flex-row gap-3">
      {THEMES.map((theme) => (
        <Pressable
          key={theme}
          onPress={() => onChange(theme)}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: THEME_COLORS[theme],
            borderWidth: value === theme ? 3 : 0,
            borderColor: '#F4F4F8',
          }}
        />
      ))}
    </View>
  );
}
