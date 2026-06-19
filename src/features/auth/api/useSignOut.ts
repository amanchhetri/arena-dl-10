import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '../store';
import { analytics } from '@/lib/analytics/client';

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await supabase.auth.signOut();
    },
    onSuccess: () => {
      useAuthStore.getState().clearAll();
      qc.clear();
      analytics.reset();
    },
  });
}
