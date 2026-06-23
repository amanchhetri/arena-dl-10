import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { analytics } from '@/lib/analytics/client';

type Vars = {
  group_id: string;
  title: string;
  description: string | null;
  category: string;
  difficulty: string;
  proof_type: 'honor' | 'photo';
};

export function useCreateGroupChallenge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: Vars) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('create_group_challenge', {
        p_group_id: vars.group_id,
        p_title: vars.title,
        p_description: vars.description,
        p_category: vars.category,
        p_difficulty: vars.difficulty,
        p_proof_type: vars.proof_type,
      });
      if (error) throw error;
      const result = data as { challenge_id: string };
      analytics.track('group_challenge_created', {
        group_id: vars.group_id,
        challenge_id: result.challenge_id,
        difficulty: vars.difficulty,
        proof_type: vars.proof_type,
      });
      return result;
    },
    onSuccess: async (_data, vars) => {
      await qc.invalidateQueries({ queryKey: ['challenges', 'group', vars.group_id] });
    },
  });
}
