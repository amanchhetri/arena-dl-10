import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';
import { analytics } from '@/lib/analytics/client';

export function useJoinGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { invite_code: string }) => {
      analytics.track('group_join_attempted', { code_present: vars.invite_code.length > 0 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('join_group', {
        p_invite_code: vars.invite_code,
      });
      if (error) throw error;
      const result = data as { group_id: string; member_count: number };
      analytics.track('group_joined', {
        group_id: result.group_id,
        new_member_count: result.member_count,
      });
      return result;
    },
    onSuccess: async () => {
      const userId = useAuthStore.getState().session?.user.id;
      await qc.invalidateQueries({ queryKey: ['groups', 'mine', userId] });
    },
  });
}
