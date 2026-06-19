// Slice 1 event registry. Adding an event = adding a typed constant.
// Per Doc B §9 and Doc C §8.

export type EventPayloads = {
  app_launched: { is_cold_start: boolean; session_id: string };
  signup_started: { provider: 'apple' | 'google' | 'email' };
  signup_completed: { user_id: string; provider: 'apple' | 'google' | 'email' };
  onboarding_step_completed: {
    step: 'username' | 'interests' | 'notifications';
    skipped: boolean;
  };
  challenge_viewed: { challenge_id: string; category: string };
  challenge_accepted: { challenge_id: string; category: string; proof_type: string };
  proof_submission_started: { accept_id: string; proof_type: 'honor' | 'photo' };
  proof_upload_completed: { accept_id: string; ms_elapsed: number; bytes: number };
  challenge_completed: {
    completion_id: string;
    xp_awarded: number;
    proof_type: string;
    duration_ms: number;
  };
  streak_milestone_hit: { streak_length: number };
  level_up: { from_level: number; to_level: number };
  notification_permission_asked: { outcome: 'granted' | 'denied' | 'undetermined' };
};

export type EventName = keyof EventPayloads;
