import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';
import { analytics } from '@/lib/analytics/client';

const VALID_INTERESTS = ['fitness', 'study', 'habit', 'dare', 'creative'] as const;

export function useSaveInterests() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (interests: string[]) => {
      const cleaned = interests
        .filter((i): i is (typeof VALID_INTERESTS)[number] => VALID_INTERESTS.includes(i as never))
        .slice(0, 5);
      const session = useAuthStore.getState().session;
      if (!session?.user.id) throw new Error('Not authenticated');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('users') as any)
        .update({ interests: cleaned })
        .eq('id', session.user.id);
      if (error) throw error;
      return cleaned;
    },
    onSuccess: async (cleaned) => {
      analytics.track('onboarding_step_completed', {
        step: 'interests',
        skipped: cleaned.length === 0,
      });
      const session = useAuthStore.getState().session;
      if (session?.user.id) {
        await qc.invalidateQueries({ queryKey: ['users', session.user.id] });
      }
    },
  });
}
