import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';
import type { ChallengeRow, AcceptStatus } from '@/types/database';

export type AcceptWithChallenge = {
  id: string;
  challenge_id: string;
  user_id: string;
  status: AcceptStatus;
  accepted_at: string;
  challenge: ChallengeRow;
};

export function useMyAccepts(status: AcceptStatus | 'all' = 'accepted') {
  const userId = useAuthStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['accepts', 'mine', userId, status],
    enabled: Boolean(userId),
    queryFn: async (): Promise<AcceptWithChallenge[]> => {
      let q = supabase
        .from('challenge_accepts')
        .select('id, challenge_id, user_id, status, accepted_at, challenge:challenges(*)')
        .eq('user_id', userId!)
        .order('accepted_at', { ascending: false });
      if (status !== 'all') q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as AcceptWithChallenge[];
    },
  });
}
