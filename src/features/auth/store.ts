import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import type { UserRow } from '@/types/database';

type AuthState = {
  session: Session | null;
  profile: UserRow | null;
  setSession: (s: Session | null) => void;
  setProfile: (p: UserRow | null) => void;
  clearAll: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  profile: null,
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  clearAll: () => set({ session: null, profile: null }),
}));
