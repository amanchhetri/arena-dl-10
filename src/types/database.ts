// Hand-written from supabase/migrations/0001..0014. Regenerate with
// `supabase gen types typescript --local > src/types/database.ts` once the
// docker-credential helper is fixed locally.

export type Category = 'fitness' | 'study' | 'dare' | 'habit' | 'creative' | 'other';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'epic';
export type ProofType = 'honor' | 'photo' | 'video' | 'peer';
export type DeadlineType = 'none' | 'daily' | 'one_time' | 'expires_at';
export type AcceptStatus = 'accepted' | 'completed' | 'expired' | 'abandoned';
export type VerificationStatus = 'auto' | 'pending_peer' | 'approved' | 'rejected';
export type GroupTheme = 'purple' | 'pink' | 'cyan' | 'flame' | 'lime' | 'gold';
export type GroupRole = 'owner' | 'admin' | 'member';

export interface UserRow {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  level: number;
  total_xp: number;
  current_streak: number;
  longest_streak: number;
  last_completion_date: string | null;
  streak_freezes_available: number;
  is_public_profile: boolean;
  locale: string;
  interests: string[];
  push_token: string | null;
  notification_pref_evening_time: string | null;
  created_at: string;
}

export interface ChallengeRow {
  id: string;
  group_id: string | null;
  title: string;
  description: string | null;
  category: Category;
  difficulty: Difficulty;
  xp_reward: number;
  proof_type: ProofType;
  deadline_type: DeadlineType;
  expires_at: string | null;
  created_by: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ChallengeAcceptRow {
  id: string;
  challenge_id: string;
  user_id: string;
  accepted_at: string;
  status: AcceptStatus;
}

export interface ChallengeCompletionRow {
  id: string;
  accept_id: string;
  user_id: string;
  challenge_id: string;
  group_id: string | null;
  proof_url: string | null;
  proof_type: ProofType;
  completed_at: string;
  xp_awarded: number;
  verification_status: VerificationStatus;
}

export interface GroupRow {
  id: string;
  name: string;
  theme: GroupTheme;
  invite_code: string;
  created_by: string | null;
  current_streak: number;
  last_activity_date: string | null;
  member_count: number;
  created_at: string;
}

export interface GroupMemberRow {
  group_id: string;
  user_id: string;
  role: GroupRole;
  joined_at: string;
}

export type ActivityEventType =
  | 'challenge_completed'
  | 'joined_group'
  | 'level_up'
  | 'group_flame_lit'
  | 'group_flame_broken'
  | 'group_flame_milestone';

export interface ActivityEventRow {
  id: string;
  group_id: string | null;
  actor_user_id: string;
  event_type: ActivityEventType;
  target_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export type LeaderboardPeriod = 'lifetime' | 'this_week';

export interface LeaderboardRow {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  role: GroupRole;
  joined_at: string;
  xp_total: number;
  rank: number | null;
}

export interface Database {
  public: {
    Tables: {
      users: {
        Row: UserRow;
        Insert: Partial<UserRow> & Pick<UserRow, 'id' | 'username' | 'display_name'>;
        Update: Partial<UserRow>;
      };
      challenges: {
        Row: ChallengeRow;
        Insert: Partial<ChallengeRow> &
          Pick<ChallengeRow, 'title' | 'category' | 'difficulty' | 'xp_reward' | 'proof_type'>;
        Update: Partial<ChallengeRow>;
      };
      challenge_accepts: {
        Row: ChallengeAcceptRow;
        Insert: Partial<ChallengeAcceptRow> & Pick<ChallengeAcceptRow, 'challenge_id' | 'user_id'>;
        Update: Partial<ChallengeAcceptRow>;
      };
      challenge_completions: {
        Row: ChallengeCompletionRow;
        Insert: Partial<ChallengeCompletionRow> &
          Pick<
            ChallengeCompletionRow,
            'accept_id' | 'user_id' | 'challenge_id' | 'proof_type' | 'xp_awarded'
          >;
        Update: Partial<ChallengeCompletionRow>;
      };
      groups: {
        Row: GroupRow;
        Insert: Partial<GroupRow> & Pick<GroupRow, 'name' | 'invite_code'>;
        Update: Partial<GroupRow>;
      };
      group_members: {
        Row: GroupMemberRow;
        Insert: Partial<GroupMemberRow> & Pick<GroupMemberRow, 'group_id' | 'user_id'>;
        Update: Partial<GroupMemberRow>;
      };
      activity_events: {
        Row: ActivityEventRow;
        Insert: Partial<ActivityEventRow> & Pick<ActivityEventRow, 'actor_user_id' | 'event_type'>;
        Update: Partial<ActivityEventRow>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      users_finalize_username: {
        Args: { p_username: string; p_user_id?: string };
        Returns: void;
      };
      is_username_available: {
        Args: { p_username: string };
        Returns: boolean;
      };
      delete_my_account: {
        Args: Record<string, never>;
        Returns: void;
      };
      submit_completion: {
        Args: { p_accept_id: string; p_proof_url?: string | null };
        Returns: {
          idempotent: boolean;
          completion_id: string;
          xp_awarded: number;
          new_total_xp: number;
          new_level: number;
          level_changed: boolean;
          new_streak: number;
          streak_changed: boolean;
        };
      };
      create_group: {
        Args: { p_name: string; p_theme?: string };
        Returns: { group_id: string; invite_code: string };
      };
      join_group: {
        Args: { p_invite_code: string };
        Returns: { group_id: string; member_count: number };
      };
      leave_group: {
        Args: { p_group_id: string };
        Returns: { left: boolean; group_deleted: boolean; new_owner?: string };
      };
      kick_member: {
        Args: { p_group_id: string; p_target_user_id: string };
        Returns: { kicked: boolean };
      };
      regenerate_invite_code: {
        Args: { p_group_id: string };
        Returns: { invite_code: string };
      };
      update_group: {
        Args: { p_group_id: string; p_name?: string | null; p_theme?: string | null };
        Returns: void;
      };
      delete_group: {
        Args: { p_group_id: string };
        Returns: void;
      };
      create_group_challenge: {
        Args: {
          p_group_id: string;
          p_title: string;
          p_description: string | null;
          p_category: string;
          p_difficulty: string;
          p_proof_type: string;
        };
        Returns: { challenge_id: string };
      };
      update_group_challenge: {
        Args: {
          p_challenge_id: string;
          p_title?: string | null;
          p_description?: string | null;
          p_difficulty?: string | null;
          p_proof_type?: string | null;
        };
        Returns: void;
      };
      delete_group_challenge: {
        Args: { p_challenge_id: string };
        Returns: void;
      };
      get_group_leaderboard: {
        Args: { p_group_id: string; p_period: LeaderboardPeriod };
        Returns: LeaderboardRow[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
