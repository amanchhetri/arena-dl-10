import PostHog from 'posthog-react-native';
import type { EventName, EventPayloads } from './events';

const postHogKey = process.env.EXPO_PUBLIC_POSTHOG_KEY;

let posthog: PostHog | null = null;

export async function initAnalytics(): Promise<void> {
  if (!postHogKey || postHogKey === 'phc_placeholder') {
    return; // skipped in dev when key not configured
  }
  posthog = new PostHog(postHogKey, { host: 'https://us.i.posthog.com' });
  await posthog.optIn();
}

type JsonPrimitive = string | number | boolean | null;
type Json = JsonPrimitive | Json[] | { [k: string]: Json };

export const analytics = {
  track<E extends EventName>(event: E, payload: EventPayloads[E]): void {
    if (!posthog) return;
    posthog.capture(event, payload as unknown as { [k: string]: Json });
  },
  identify(userId: string, traits?: { [k: string]: Json }): void {
    if (!posthog) return;
    posthog.identify(userId, traits);
  },
  reset(): void {
    if (!posthog) return;
    posthog.reset();
  },
};
