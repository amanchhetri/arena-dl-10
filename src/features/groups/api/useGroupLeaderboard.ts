import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { LeaderboardPeriod, LeaderboardRow } from '@/types/database';

export function useGroupLeaderboard(groupId: string | undefined, period: LeaderboardPeriod) {
  return useQuery({
    queryKey: ['leaderboard', groupId, period],
    enabled: Boolean(groupId),
    queryFn: async (): Promise<LeaderboardRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('get_group_leaderboard', {
        p_group_id: groupId,
        p_period: period,
      });
      if (error) throw error;
      return (data ?? []) as LeaderboardRow[];
    },
  });
}
