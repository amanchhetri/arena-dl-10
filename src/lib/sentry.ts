import * as Sentry from '@sentry/react-native';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function initSentry(): void {
  if (!dsn) return; // skipped in dev when DSN not configured
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    enableAutoPerformanceTracing: true,
  });
}

export { Sentry };
