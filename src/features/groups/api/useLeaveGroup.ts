import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';
import { analytics } from '@/lib/analytics/client';

export function useLeaveGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { group_id: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('leave_group', {
        p_group_id: vars.group_id,
      });
      if (error) throw error;
      const result = data as { left: boolean; group_deleted: boolean; new_owner?: string };
      analytics.track('group_left', {
        group_id: vars.group_id,
        was_owner: Boolean(result.new_owner) || result.group_deleted,
        group_deleted: result.group_deleted,
      });
      return result;
    },
    onSuccess: async (_data, vars) => {
      const userId = useAuthStore.getState().session?.user.id;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['groups', 'mine', userId] }),
        qc.invalidateQueries({ queryKey: ['groups', 'single', vars.group_id] }),
        qc.invalidateQueries({ queryKey: ['groups', 'members', vars.group_id] }),
      ]);
    },
  });
}
