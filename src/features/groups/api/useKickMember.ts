import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { analytics } from '@/lib/analytics/client';

export function useKickMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { group_id: string; user_id: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('kick_member', {
        p_group_id: vars.group_id,
        p_target_user_id: vars.user_id,
      });
      if (error) throw error;
      analytics.track('member_kicked', { group_id: vars.group_id });
    },
    onSuccess: async (_data, vars) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['groups', 'single', vars.group_id] }),
        qc.invalidateQueries({ queryKey: ['groups', 'members', vars.group_id] }),
      ]);
    },
  });
}
