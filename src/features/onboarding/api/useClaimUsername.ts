import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';
import { UsernameSchema } from '@/features/auth/schema';
import { analytics } from '@/lib/analytics/client';

export function useClaimUsername() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rawUsername: string) => {
      const username = UsernameSchema.parse(rawUsername);
      // supabase-js's RPC types narrow to `never` for our hand-written Database
      // type's Functions entries; the runtime call shape is correct.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('users_finalize_username', {
        p_username: username,
      });
      if (error) throw error;
      return username;
    },
    onSuccess: async () => {
      analytics.track('onboarding_step_completed', { step: 'username', skipped: false });
      const session = useAuthStore.getState().session;
      if (session?.user.id) {
        await qc.invalidateQueries({ queryKey: ['users', session.user.id] });
      }
    },
  });
}
