import { Text, View } from 'react-native';
import { t } from '@/lib/i18n';

type Props = { currentStreak: number };

export function GroupFlameChip({ currentStreak }: Props) {
  if (currentStreak > 0) {
    return (
      <View className="flex-row items-center gap-1 rounded-full bg-flame-from/15 px-3 py-1">
        <Text className="text-base">🔥</Text>
        <Text className="text-sm font-semibold text-flame-from">
          {t('groupFlame.active', { streak: currentStreak })}
        </Text>
      </View>
    );
  }
  return (
    <View className="rounded-full bg-bg-elevated px-3 py-1">
      <Text className="text-sm text-text-muted">{t('groupFlame.dormant')}</Text>
    </View>
  );
}
