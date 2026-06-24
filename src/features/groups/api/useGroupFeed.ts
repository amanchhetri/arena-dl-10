import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ActivityEventRow, UserRow } from '@/types/database';

export type ActorProfile = Pick<UserRow, 'id' | 'username' | 'display_name' | 'avatar_url'>;
export type ActivityEventWithActor = ActivityEventRow & { actor: ActorProfile | null };

export function useGroupFeed(groupId: string | undefined, limit = 50) {
  return useQuery({
    queryKey: ['feed', groupId, limit],
    enabled: Boolean(groupId),
    queryFn: async (): Promise<ActivityEventWithActor[]> => {
      const { data, error } = await supabase
        .from('activity_events')
        .select('*, actor:users!actor_user_id(id, username, display_name, avatar_url)')
        .eq('group_id', groupId!)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as ActivityEventWithActor[];
    },
  });
}
