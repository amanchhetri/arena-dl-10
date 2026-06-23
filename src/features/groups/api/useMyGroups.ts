import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';
import type { GroupRole, GroupRow } from '@/types/database';

export type GroupWithMembership = GroupRow & { my_role: GroupRole };

export function useMyGroups() {
  const userId = useAuthStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['groups', 'mine', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<GroupWithMembership[]> => {
      const { data, error } = await supabase
        .from('group_members')
        .select('role, group:groups(*)')
        .eq('user_id', userId!)
        .order('joined_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as { role: GroupRole; group: GroupRow }[])
        .filter((r) => r.group)
        .map((r) => ({ ...r.group, my_role: r.role }));
    },
  });
}
