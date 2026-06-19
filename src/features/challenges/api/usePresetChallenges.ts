import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ChallengeRow, Category } from '@/types/database';

export function usePresetChallenges(category?: Category | 'all') {
  return useQuery({
    queryKey: ['challenges', 'presets', category ?? 'all'],
    queryFn: async (): Promise<ChallengeRow[]> => {
      let q = supabase
        .from('challenges')
        .select('*')
        .is('group_id', null)
        .eq('is_active', true)
        .order('created_at', { ascending: true });
      if (category && category !== 'all') q = q.eq('category', category);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ChallengeRow[];
    },
  });
}
