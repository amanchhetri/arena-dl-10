import type { Session } from '@supabase/supabase-js';
import { useAuthStore } from './store';

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.getState().clearSession();
  });

  it('starts with null session', () => {
    expect(useAuthStore.getState().session).toBeNull();
  });

  it('setSession stores the session', () => {
    const fakeSession = { access_token: 'abc', user: { id: '1' } } as unknown as Session;
    useAuthStore.getState().setSession(fakeSession);
    expect(useAuthStore.getState().session).toBe(fakeSession);
  });

  it('clearSession sets session to null', () => {
    const fakeSession = { access_token: 'abc' } as unknown as Session;
    useAuthStore.getState().setSession(fakeSession);
    useAuthStore.getState().clearSession();
    expect(useAuthStore.getState().session).toBeNull();
  });
});
