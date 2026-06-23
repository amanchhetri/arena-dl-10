import type { GroupTheme } from '@/types/database';

export const colors = {
  bg: { base: '#0A0A0F', surface: '#16161C', elevated: '#1F1F28' },
  primary: { 500: '#A855F7' },
  accent: { pink: '#EC4899', cyan: '#06B6D4' },
  flame: { from: '#F97316', to: '#EF4444' },
  xp: { gain: '#84CC16' },
  text: { primary: '#F4F4F8', muted: '#8B8B98' },
} as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, full: 999 } as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, '2xl': 32 } as const;

export const THEME_COLORS: Record<GroupTheme, string> = {
  purple: '#A855F7',
  pink: '#EC4899',
  cyan: '#06B6D4',
  flame: '#F97316',
  lime: '#84CC16',
  gold: '#F59E0B',
} as const;
