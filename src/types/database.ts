// Hand-written from supabase/migrations/0001..0004. Regenerate with
// `supabase gen types typescript --local > src/types/database.ts` once the
// docker-credential helper is fixed locally.

export type Category = 'fitness' | 'study' | 'dare' | 'habit' | 'creative' | 'other';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'epic';
export type ProofType = 'honor' | 'photo' | 'video' | 'peer';
export type DeadlineType = 'none' | 'daily' | 'one_time' | 'expires_at';
export type AcceptStatus = 'accepted' | 'completed' | 'expired' | 'abandoned';
export type VerificationStatus = 'auto' | 'pending_peer' | 'approved' | 'rejected';

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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
