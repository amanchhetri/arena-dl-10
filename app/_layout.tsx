import '../global.css';
import '@/lib/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { initAnalytics } from '@/lib/analytics/client';
import { initSentry } from '@/lib/sentry';
import { useAuthStore } from '@/features/auth/store';
import { useCurrentUserProfile } from '@/features/auth/api/useCurrentUserProfile';

initSentry();

function AuthRouter() {
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const segments = useSegments();
  const router = useRouter();
  const { isLoading } = useCurrentUserProfile();

  useEffect(() => {
    if (session && isLoading && !profile) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === 'onboarding';

    if (!session) {
      if (!inAuthGroup) router.replace('/(auth)/sign-in');
      return;
    }
    const needsOnboarding = !profile || profile.username.startsWith('u_');
    if (needsOnboarding) {
      if (!inOnboarding) router.replace('/onboarding/username');
      return;
    }
    if (inAuthGroup || inOnboarding) {
      router.replace('/(tabs)');
    }
  }, [session, profile, segments, router, isLoading]);

  return <Slot />;
}

export default function RootLayout() {
  useEffect(() => {
    void initAnalytics();
    supabase.auth.getSession().then(({ data }) => {
      useAuthStore.getState().setSession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      useAuthStore.getState().setSession(session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthRouter />
    </QueryClientProvider>
  );
}
