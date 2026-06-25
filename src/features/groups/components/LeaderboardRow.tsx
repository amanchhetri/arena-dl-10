import { Text, View } from 'react-native';
import type { LeaderboardRow as LeaderboardRowData } from '@/types/database';
import { t } from '@/lib/i18n';

type Props = {
  row: LeaderboardRowData;
  isSelf: boolean;
};

function RankPill({ rank }: { rank: number | null }) {
  if (rank == null) {
    return (
      <View className="h-8 w-8 items-center justify-center rounded-full bg-bg-elevated">
        <Text className="text-sm text-text-muted">{t('leaderboard.rank.noRank')}</Text>
      </View>
    );
  }
  return (
    <View className="h-8 w-8 items-center justify-center rounded-full bg-bg-elevated">
      <Text className="text-sm font-semibold text-text-primary">{rank}</Text>
    </View>
  );
}

function AvatarCircle({ display }: { display: string }) {
  return (
    <View className="h-10 w-10 items-center justify-center rounded-full bg-primary-500/30">
      <Text className="font-display text-base text-text-primary">
        {display.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

export function LeaderboardRow({ row, isSelf }: Props) {
  return (
    <View
      className={`flex-row items-center gap-3 rounded-2xl p-3 ${
        isSelf ? 'bg-primary-500/10' : 'bg-bg-surface'
      }`}
    >
      <RankPill rank={row.rank} />
      <AvatarCircle display={row.username} />
      <View className="flex-1 flex-row items-center gap-1">
        <Text className="font-semibold text-text-primary">@{row.username}</Text>
        {row.role === 'owner' && <Text className="text-base">👑</Text>}
      </View>
      <View className="rounded-full bg-xp-gain/20 px-3 py-1">
        <Text className="text-xs font-semibold text-xp-gain">
          {t('leaderboard.xp', { xp: row.xp_total })}
        </Text>
      </View>
    </View>
  );
}
