import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { GroupRole, UserRow } from '@/types/database';

export type MemberWithProfile = {
  user_id: string;
  role: GroupRole;
  joined_at: string;
  user: Pick<UserRow, 'id' | 'username' | 'display_name' | 'avatar_url'>;
};

export function useGroupMembers(groupId: string | undefined) {
  return useQuery({
    queryKey: ['groups', 'members', groupId],
    enabled: Boolean(groupId),
    queryFn: async (): Promise<MemberWithProfile[]> => {
      const { data, error } = await supabase
        .from('group_members')
        .select('user_id, role, joined_at, user:users(id, username, display_name, avatar_url)')
        .eq('group_id', groupId!)
        .order('joined_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as MemberWithProfile[];
    },
  });
}
