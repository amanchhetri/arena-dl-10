import { BookOpenText, House, User } from 'phosphor-react-native';

export const Icon = {
  Home: House,
  Catalog: BookOpenText,
  Profile: User,
} as const;

export const ICON_DEFAULTS = {
  size: 24,
  weight: 'duotone' as const,
};
