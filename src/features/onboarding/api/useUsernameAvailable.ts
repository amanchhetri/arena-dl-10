import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { RESERVED_USERNAMES } from '@/lib/reservedUsernames';
import { UsernameSchema } from '@/features/auth/schema';

export function useUsernameAvailable(rawUsername: string) {
  const parsed = UsernameSchema.safeParse(rawUsername);
  const username = parsed.success ? parsed.data : null;

  return useQuery({
    queryKey: ['username-available', username],
    enabled: Boolean(username),
    staleTime: 10_000,
    queryFn: async (): Promise<{ available: boolean; reason?: string }> => {
      if (!username) return { available: false };
      if (RESERVED_USERNAMES.includes(username)) return { available: false, reason: 'reserved' };
      const { count, error } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('username', username);
      if (error) throw error;
      return { available: (count ?? 0) === 0 };
    },
  });
}
