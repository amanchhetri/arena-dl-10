import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';
import type { ChallengeAcceptRow } from '@/types/database';

export function useMyAccept(challengeId: string | undefined) {
  const userId = useAuthStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['accepts', 'single', userId, challengeId],
    enabled: Boolean(userId && challengeId),
    queryFn: async (): Promise<ChallengeAcceptRow | null> => {
      const { data, error } = await supabase
        .from('challenge_accepts')
        .select('*')
        .eq('user_id', userId!)
        .eq('challenge_id', challengeId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ChallengeAcceptRow | null;
    },
  });
}
