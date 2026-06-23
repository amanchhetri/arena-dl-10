import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ChallengeRow } from '@/types/database';

export function useGroupChallenges(groupId: string | undefined) {
  return useQuery({
    queryKey: ['challenges', 'group', groupId],
    enabled: Boolean(groupId),
    queryFn: async (): Promise<ChallengeRow[]> => {
      const { data, error } = await supabase
        .from('challenges')
        .select('*')
        .eq('group_id', groupId!)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ChallengeRow[];
    },
  });
}
