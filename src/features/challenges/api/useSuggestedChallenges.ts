import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';
import type { ChallengeRow } from '@/types/database';

export function useSuggestedChallenges() {
  const profile = useAuthStore((s) => s.profile);
  const userId = profile?.id;
  const interests = profile?.interests ?? [];

  return useQuery({
    queryKey: ['challenges', 'suggested', userId, interests.join(',')],
    enabled: Boolean(userId),
    queryFn: async (): Promise<ChallengeRow[]> => {
      const { data: accepts, error: aErr } = await supabase
        .from('challenge_accepts')
        .select('challenge_id')
        .eq('user_id', userId!);
      if (aErr) throw aErr;
      const acceptedIds = ((accepts ?? []) as { challenge_id: string }[]).map(
        (a) => a.challenge_id,
      );

      let q = supabase
        .from('challenges')
        .select('*')
        .is('group_id', null)
        .eq('is_active', true)
        .limit(6);
      if (interests.length > 0) q = q.in('category', interests);
      if (acceptedIds.length > 0) q = q.not('id', 'in', `(${acceptedIds.join(',')})`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ChallengeRow[];
    },
  });
}
