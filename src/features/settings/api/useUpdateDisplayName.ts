import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';

export function useUpdateDisplayName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim();
      if (trimmed.length < 1 || trimmed.length > 40) {
        throw new Error('Display name must be 1-40 characters');
      }
      const userId = useAuthStore.getState().session?.user.id;
      if (!userId) throw new Error('Not authenticated');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('users') as any)
        .update({ display_name: trimmed })
        .eq('id', userId);
      if (error) throw error;
    },
    onSuccess: async () => {
      const userId = useAuthStore.getState().session?.user.id;
      await qc.invalidateQueries({ queryKey: ['users', userId] });
    },
  });
}
