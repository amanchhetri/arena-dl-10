import { Stack } from 'expo-router';
import { t } from '@/lib/i18n';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#0A0A0F' },
        headerTintColor: '#F4F4F8',
        headerTitleStyle: { color: '#F4F4F8' },
      }}
    >
      <Stack.Screen name="index" options={{ title: t('settings.title') }} />
      <Stack.Screen name="notification-time" options={{ presentation: 'modal', title: '' }} />
      <Stack.Screen name="display-name" options={{ presentation: 'modal', title: '' }} />
      <Stack.Screen name="delete-account" options={{ presentation: 'modal', title: '' }} />
    </Stack>
  );
}
