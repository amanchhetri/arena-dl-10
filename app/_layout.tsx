import '../global.css';
import '@/lib/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { queryClient } from '@/lib/queryClient';
import { initAnalytics } from '@/lib/analytics/client';
import { initSentry } from '@/lib/sentry';

initSentry();

export default function RootLayout() {
  useEffect(() => {
    void initAnalytics();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  );
}
