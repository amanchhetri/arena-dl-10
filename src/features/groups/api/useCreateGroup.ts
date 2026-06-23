import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';
import { analytics } from '@/lib/analytics/client';

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { name: string; theme: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('create_group', {
        p_name: vars.name,
        p_theme: vars.theme,
      });
      if (error) throw error;
      const result = data as { group_id: string; invite_code: string };
      analytics.track('group_created', { group_id: result.group_id, theme: vars.theme });
      return result;
    },
    onSuccess: async () => {
      const userId = useAuthStore.getState().session?.user.id;
      await qc.invalidateQueries({ queryKey: ['groups', 'mine', userId] });
    },
  });
}
