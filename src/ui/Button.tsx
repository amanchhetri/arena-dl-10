import { Pressable, Text, type PressableProps } from 'react-native';

type Variant = 'primary' | 'ghost';

type Props = Omit<PressableProps, 'children'> & {
  children: string;
  variant?: Variant;
  disabled?: boolean;
};

const variantClasses: Record<Variant, string> = {
  primary: 'bg-primary-500 active:opacity-80',
  ghost: 'bg-transparent active:opacity-60',
};

const variantTextClasses: Record<Variant, string> = {
  primary: 'text-white',
  ghost: 'text-text-primary',
};

export function Button({ children, variant = 'primary', disabled, ...rest }: Props) {
  return (
    <Pressable
      {...rest}
      disabled={disabled}
      className={`items-center justify-center rounded-2xl px-6 py-4 ${variantClasses[variant]} ${
        disabled ? 'opacity-40' : ''
      }`}
    >
      <Text className={`text-base font-semibold ${variantTextClasses[variant]}`}>{children}</Text>
    </Pressable>
  );
}
