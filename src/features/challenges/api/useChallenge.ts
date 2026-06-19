import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ChallengeRow } from '@/types/database';

export function useChallenge(id: string | undefined) {
  return useQuery({
    queryKey: ['challenges', 'single', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<ChallengeRow | null> => {
      const { data, error } = await supabase
        .from('challenges')
        .select('*')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ChallengeRow | null;
    },
  });
}
