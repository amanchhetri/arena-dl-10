import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { analytics } from '@/lib/analytics/client';
import { EmailSchema } from '../schema';

export function useSignInWithEmail() {
  return useMutation({
    mutationFn: async (rawEmail: string) => {
      const email = EmailSchema.parse(rawEmail);
      analytics.track('signup_started', { provider: 'email' });
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: 'arena://auth' },
      });
      if (error) throw error;
      return email;
    },
  });
}
