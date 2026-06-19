import { analytics } from '../client';

// Compile-time check: track() must accept typed payloads.
// Runtime is a no-op since posthog is null without a real key.
describe('analytics typed events', () => {
  it('accepts well-typed payloads at compile time', () => {
    analytics.track('challenge_accepted', {
      challenge_id: 'abc',
      category: 'habit',
      proof_type: 'honor',
    });
    analytics.track('level_up', { from_level: 1, to_level: 2 });
    expect(true).toBe(true);
  });
});
