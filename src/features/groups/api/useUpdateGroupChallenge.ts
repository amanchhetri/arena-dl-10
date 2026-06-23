import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { analytics } from '@/lib/analytics/client';

type Vars = {
  challenge_id: string;
  group_id: string;
  title?: string;
  description?: string | null;
  difficulty?: string;
  proof_type?: 'honor' | 'photo';
};

export function useUpdateGroupChallenge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: Vars) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('update_group_challenge', {
        p_challenge_id: vars.challenge_id,
        p_title: vars.title ?? null,
        p_description: vars.description ?? null,
        p_difficulty: vars.difficulty ?? null,
        p_proof_type: vars.proof_type ?? null,
      });
      if (error) throw error;
      analytics.track('group_challenge_updated', {
        group_id: vars.group_id,
        challenge_id: vars.challenge_id,
      });
    },
    onSuccess: async (_data, vars) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['challenges', 'single', vars.challenge_id] }),
        qc.invalidateQueries({ queryKey: ['challenges', 'group', vars.group_id] }),
      ]);
    },
  });
}
