import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';
import type { ChallengeCompletionRow } from '@/types/database';

export function useMyCompletion(acceptId: string | undefined) {
  const userId = useAuthStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['completions', 'by-accept', userId, acceptId],
    enabled: Boolean(userId && acceptId),
    queryFn: async (): Promise<ChallengeCompletionRow | null> => {
      const { data, error } = await supabase
        .from('challenge_completions')
        .select('*')
        .eq('accept_id', acceptId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ChallengeCompletionRow | null;
    },
  });
}
