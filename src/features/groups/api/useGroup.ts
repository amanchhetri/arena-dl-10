import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { GroupRow } from '@/types/database';

export function useGroup(id: string | undefined) {
  return useQuery({
    queryKey: ['groups', 'single', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<GroupRow | null> => {
      const { data, error } = await supabase.from('groups').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return (data ?? null) as GroupRow | null;
    },
  });
}
