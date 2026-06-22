import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';
import { analytics } from '@/lib/analytics/client';

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('delete_my_account');
      if (error) throw error;
    },
    onSuccess: async () => {
      await supabase.auth.signOut();
      useAuthStore.getState().clearAll();
      qc.clear();
      analytics.reset();
    },
  });
}
