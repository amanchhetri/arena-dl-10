import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';
import { analytics } from '@/lib/analytics/client';

export function useRegisterPushToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<'granted' | 'denied' | 'undetermined'> => {
      if (!Device.isDevice) {
        analytics.track('notification_permission_asked', { outcome: 'undetermined' });
        return 'undetermined';
      }
      const existing = await Notifications.getPermissionsAsync();
      let status = existing.status;
      if (status !== 'granted') {
        const req = await Notifications.requestPermissionsAsync();
        status = req.status;
      }
      const outcome: 'granted' | 'denied' | 'undetermined' =
        status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
      analytics.track('notification_permission_asked', { outcome });
      if (status !== 'granted') return outcome;

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }

      const projectId =
        (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ??
        (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;
      const token = projectId
        ? (await Notifications.getExpoPushTokenAsync({ projectId })).data
        : (await Notifications.getExpoPushTokenAsync()).data;

      const session = useAuthStore.getState().session;
      if (session?.user.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('users') as any)
          .update({ push_token: token })
          .eq('id', session.user.id);
        await qc.invalidateQueries({ queryKey: ['users', session.user.id] });
      }
      return 'granted';
    },
    onSuccess: () => {
      analytics.track('onboarding_step_completed', { step: 'notifications', skipped: false });
    },
  });
}
