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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('is_username_available', {
        p_username: username,
      });
      if (error) throw error;
      return { available: Boolean(data) };
    },
  });
}
