import { Share } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/store';
import { t } from '@/lib/i18n';

const PLACEHOLDER_BASE = 'https://arena.app/u';

export function useShareProfile() {
  return useMutation({
    mutationFn: async () => {
      const profile = useAuthStore.getState().profile;
      if (!profile) throw new Error('No profile loaded');
      const url = `${PLACEHOLDER_BASE}/${profile.username}`;
      const message = t('share.profile.message', {
        username: profile.username,
        xp: profile.total_xp,
        streak: profile.current_streak,
      });
      await Share.share({
        title: t('share.profile.title'),
        message: `${message}\n${url}`,
        url,
      });
    },
  });
}
