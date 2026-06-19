import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';
import { analytics } from '@/lib/analytics/client';

export type SubmitCompletionResult = {
  idempotent: boolean;
  completion_id: string;
  xp_awarded: number;
  new_total_xp: number;
  new_level: number;
  level_changed: boolean;
  new_streak: number;
  streak_changed: boolean;
};

type Vars = {
  acceptId: string;
  challengeId: string;
  proofUrl: string | null;
  proofType: 'honor' | 'photo';
};

export function useSubmitCompletion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      acceptId,
      proofUrl,
      proofType,
    }: Vars): Promise<SubmitCompletionResult> => {
      const startedAt = Date.now();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('submit_completion', {
        p_accept_id: acceptId,
        p_proof_url: proofUrl,
      });
      if (error) throw error;
      const result = data as SubmitCompletionResult;

      analytics.track('challenge_completed', {
        completion_id: result.completion_id,
        xp_awarded: result.xp_awarded,
        proof_type: proofType,
        duration_ms: Date.now() - startedAt,
      });
      if (result.level_changed) {
        analytics.track('level_up', {
          from_level: result.new_level - 1,
          to_level: result.new_level,
        });
      }
      if ([1, 3, 7, 14, 30].includes(result.new_streak) && result.streak_changed) {
        analytics.track('streak_milestone_hit', { streak_length: result.new_streak });
      }
      return result;
    },
    onSuccess: async (_data, { challengeId }) => {
      const userId = useAuthStore.getState().session?.user.id;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['accepts', 'mine', userId] }),
        qc.invalidateQueries({ queryKey: ['accepts', 'single', userId, challengeId] }),
        qc.invalidateQueries({ queryKey: ['users', userId] }),
        qc.invalidateQueries({ queryKey: ['challenges', 'suggested', userId] }),
      ]);
    },
  });
}
