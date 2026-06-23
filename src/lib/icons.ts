import { BookOpenText, Gear, House, User, UsersThree } from 'phosphor-react-native';

export const Icon = {
  Home: House,
  Catalog: BookOpenText,
  Profile: User,
  Groups: UsersThree,
  Settings: Gear,
} as const;

export const ICON_DEFAULTS = {
  size: 24,
  weight: 'duotone' as const,
};
