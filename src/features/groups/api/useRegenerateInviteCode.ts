import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { analytics } from '@/lib/analytics/client';

export function useRegenerateInviteCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { group_id: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('regenerate_invite_code', {
        p_group_id: vars.group_id,
      });
      if (error) throw error;
      analytics.track('invite_code_regenerated', { group_id: vars.group_id });
      return data as { invite_code: string };
    },
    onSuccess: async (_data, vars) => {
      await qc.invalidateQueries({ queryKey: ['groups', 'single', vars.group_id] });
    },
  });
}
