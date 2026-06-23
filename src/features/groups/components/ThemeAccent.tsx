import { View } from 'react-native';
import { THEME_COLORS } from '@/theme/tokens';
import type { GroupTheme } from '@/types/database';

type Props = { theme: GroupTheme; size?: number };

export function ThemeAccent({ theme, size = 12 }: Props) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: THEME_COLORS[theme],
      }}
    />
  );
}
