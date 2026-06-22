import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';

export function useUpdateNotifTime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (timeHHMM: string) => {
      const userId = useAuthStore.getState().session?.user.id;
      if (!userId) throw new Error('Not authenticated');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('users') as any)
        .update({ notification_pref_evening_time: timeHHMM })
        .eq('id', userId);
      if (error) throw error;
    },
    onSuccess: async () => {
      const userId = useAuthStore.getState().session?.user.id;
      await qc.invalidateQueries({ queryKey: ['users', userId] });
    },
  });
}
