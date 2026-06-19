import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';
import { analytics } from '@/lib/analytics/client';
import type { ChallengeRow } from '@/types/database';

type Vars = { challenge: ChallengeRow };

export function useAcceptChallenge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ challenge }: Vars) => {
      const userId = useAuthStore.getState().session?.user.id;
      if (!userId) throw new Error('Not authenticated');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('challenge_accepts') as any)
        .insert({ challenge_id: challenge.id, user_id: userId })
        .select('id, challenge_id, user_id, status, accepted_at')
        .single();
      if (error) {
        if ((error as { code?: string }).code === '23505') return null; // already accepted
        throw error;
      }
      analytics.track('challenge_accepted', {
        challenge_id: challenge.id,
        category: challenge.category,
        proof_type: challenge.proof_type,
      });
      return data;
    },
    onSuccess: async (_data, { challenge }) => {
      const userId = useAuthStore.getState().session?.user.id;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['accepts', 'mine', userId] }),
        qc.invalidateQueries({ queryKey: ['accepts', 'single', userId, challenge.id] }),
        qc.invalidateQueries({ queryKey: ['challenges', 'suggested', userId] }),
      ]);
    },
  });
}
