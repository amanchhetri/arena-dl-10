import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';

export function useToggleProfileVisibility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (isPublic: boolean) => {
      const userId = useAuthStore.getState().session?.user.id;
      if (!userId) throw new Error('Not authenticated');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('users') as any)
        .update({ is_public_profile: isPublic })
        .eq('id', userId);
      if (error) throw error;
    },
    onSuccess: async () => {
      const userId = useAuthStore.getState().session?.user.id;
      await qc.invalidateQueries({ queryKey: ['users', userId] });
    },
  });
}
