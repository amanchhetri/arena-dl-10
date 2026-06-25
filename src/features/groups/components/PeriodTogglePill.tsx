import { Pressable, Text, View } from 'react-native';
import type { LeaderboardPeriod } from '@/types/database';
import { t } from '@/lib/i18n';

type Props = {
  value: LeaderboardPeriod;
  onChange: (next: LeaderboardPeriod) => void;
};

const SEGMENTS: { value: LeaderboardPeriod; labelKey: string }[] = [
  { value: 'this_week', labelKey: 'leaderboard.tabs.thisWeek' },
  { value: 'lifetime', labelKey: 'leaderboard.tabs.allTime' },
];

export function PeriodTogglePill({ value, onChange }: Props) {
  return (
    <View className="flex-row gap-1 rounded-full bg-bg-elevated p-1">
      {SEGMENTS.map((seg) => {
        const active = value === seg.value;
        return (
          <Pressable
            key={seg.value}
            onPress={() => onChange(seg.value)}
            className={`flex-1 items-center rounded-full px-4 py-2 ${
              active ? 'bg-primary-500' : ''
            }`}
          >
            <Text className={`text-sm font-semibold ${active ? 'text-white' : 'text-text-muted'}`}>
              {t(seg.labelKey)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
