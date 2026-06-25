import { Pressable, Text, View } from 'react-native';
import { useGroupLeaderboard } from '../api/useGroupLeaderboard';
import { useAuthStore } from '@/features/auth/store';
import { analytics } from '@/lib/analytics/client';
import { t } from '@/lib/i18n';

type Props = {
  groupId: string;
  onPress: () => void;
};

function PodiumSlot({
  rank,
  username,
  xp,
  isSelf,
  isFirst,
}: {
  rank: number;
  username: string;
  xp: number;
  isSelf: boolean;
  isFirst?: boolean;
}) {
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉';
  return (
    <View
      className={`flex-1 items-center rounded-2xl p-3 ${
        isSelf ? 'bg-primary-500/10' : 'bg-bg-surface'
      }`}
    >
      <Text className={isFirst ? 'text-3xl' : 'text-2xl'}>{medal}</Text>
      <Text
        className={`mt-1 font-semibold ${
          isFirst ? 'text-base text-text-primary' : 'text-sm text-text-primary'
        }`}
        numberOfLines={1}
      >
        @{username}
      </Text>
      <Text className="text-xs text-text-muted">{t('leaderboard.xp', { xp })}</Text>
    </View>
  );
}

export function LeaderboardPodium({ groupId, onPress }: Props) {
  const { data: rows } = useGroupLeaderboard(groupId, 'this_week');
  const userId = useAuthStore((s) => s.session?.user.id);

  if (!rows) return null;

  // Only members with rank (xp > 0) qualify for the podium
  const ranked = rows.filter((r) => r.rank != null).slice(0, 3);

  if (ranked.length === 0) {
    return (
      <Pressable onPress={onPress} className="active:opacity-80">
        <View className="rounded-2xl bg-bg-surface px-4 py-6">
          <Text className="mb-3 text-xs font-semibold tracking-widest text-text-muted">
            {t('leaderboard.preview.title')}
          </Text>
          <Text className="text-center text-sm text-text-muted">
            {t('leaderboard.empty.preview')}
          </Text>
        </View>
      </Pressable>
    );
  }

  function handlePress() {
    analytics.track('leaderboard_preview_tapped', { group_id: groupId });
    onPress();
  }

  // Layout: 2nd | 1st | 3rd, with 1st emphasized
  const first = ranked[0];
  const second = ranked[1];
  const third = ranked[2];

  return (
    <Pressable onPress={handlePress} className="active:opacity-80">
      <View>
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-xs font-semibold tracking-widest text-text-muted">
            {t('leaderboard.preview.title')}
          </Text>
          <Text className="text-sm font-semibold text-primary-500">
            {t('leaderboard.preview.seeAll')}
          </Text>
        </View>
        <View className="flex-row items-end gap-2">
          {second && (
            <PodiumSlot
              rank={2}
              username={second.username}
              xp={second.xp_total}
              isSelf={second.user_id === userId}
            />
          )}
          {first && (
            <PodiumSlot
              rank={1}
              username={first.username}
              xp={first.xp_total}
              isSelf={first.user_id === userId}
              isFirst
            />
          )}
          {third && (
            <PodiumSlot
              rank={3}
              username={third.username}
              xp={third.xp_total}
              isSelf={third.user_id === userId}
            />
          )}
        </View>
      </View>
    </Pressable>
  );
}
