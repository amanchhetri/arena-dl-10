import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '../store';
import type { UserRow } from '@/types/database';

export function useCurrentUserProfile() {
  const session = useAuthStore((s) => s.session);
  const setProfile = useAuthStore((s) => s.setProfile);

  const query = useQuery<UserRow | null>({
    queryKey: ['users', session?.user.id ?? 'anon'],
    enabled: Boolean(session?.user.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', session!.user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (query.data) setProfile(query.data);
    if (query.data === null) setProfile(null);
  }, [query.data, setProfile]);

  return query;
}
