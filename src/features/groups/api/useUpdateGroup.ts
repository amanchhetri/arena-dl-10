import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';

export function useUpdateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { group_id: string; name?: string; theme?: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('update_group', {
        p_group_id: vars.group_id,
        p_name: vars.name ?? null,
        p_theme: vars.theme ?? null,
      });
      if (error) throw error;
    },
    onSuccess: async (_data, vars) => {
      const userId = useAuthStore.getState().session?.user.id;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['groups', 'single', vars.group_id] }),
        qc.invalidateQueries({ queryKey: ['groups', 'mine', userId] }),
      ]);
    },
  });
}
