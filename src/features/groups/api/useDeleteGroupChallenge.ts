import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';
import { analytics } from '@/lib/analytics/client';

type Vars = {
  challenge_id: string;
  group_id: string;
  by_owner: boolean;
};

export function useDeleteGroupChallenge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: Vars) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('delete_group_challenge', {
        p_challenge_id: vars.challenge_id,
      });
      if (error) throw error;
      analytics.track('group_challenge_deleted', {
        group_id: vars.group_id,
        challenge_id: vars.challenge_id,
        by_owner: vars.by_owner,
      });
    },
    onSuccess: async (_data, vars) => {
      const userId = useAuthStore.getState().session?.user.id;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['challenges', 'single', vars.challenge_id] }),
        qc.invalidateQueries({ queryKey: ['challenges', 'group', vars.group_id] }),
        qc.invalidateQueries({ queryKey: ['accepts', 'mine', userId] }),
      ]);
    },
  });
}
