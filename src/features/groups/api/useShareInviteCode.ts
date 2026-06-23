import { Share } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { analytics } from '@/lib/analytics/client';
import { t } from '@/lib/i18n';

export function useShareInviteCode() {
  return useMutation({
    mutationFn: async (vars: { group_id: string; group_name: string; invite_code: string }) => {
      const message = t('groups.share.message', {
        name: vars.group_name,
        code: vars.invite_code,
      });
      await Share.share({ message });
      analytics.track('invite_code_shared', { group_id: vars.group_id });
    },
  });
}
