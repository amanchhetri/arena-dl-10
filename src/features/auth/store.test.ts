import type { Session } from '@supabase/supabase-js';
import { useAuthStore } from './store';

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.getState().clearAll();
  });

  it('starts with null session and null profile', () => {
    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().profile).toBeNull();
  });

  it('setSession stores the session', () => {
    const fakeSession = { access_token: 'abc', user: { id: '1' } } as unknown as Session;
    useAuthStore.getState().setSession(fakeSession);
    expect(useAuthStore.getState().session).toBe(fakeSession);
  });

  it('setProfile stores the profile', () => {
    const fakeProfile = { id: '1', username: 'mira_', display_name: 'Mira' } as never;
    useAuthStore.getState().setProfile(fakeProfile);
    expect(useAuthStore.getState().profile).toBe(fakeProfile);
  });

  it('clearAll clears both', () => {
    const s = { access_token: 'x' } as unknown as Session;
    useAuthStore.getState().setSession(s);
    useAuthStore.getState().setProfile({ id: '1' } as never);
    useAuthStore.getState().clearAll();
    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().profile).toBeNull();
  });
});
