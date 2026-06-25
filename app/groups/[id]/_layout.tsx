import { Stack } from 'expo-router';

export default function GroupLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#0A0A0F' },
        headerTintColor: '#F4F4F8',
        headerTitleStyle: { color: '#F4F4F8' },
      }}
    >
      <Stack.Screen name="index" options={{ title: '' }} />
      <Stack.Screen name="members" options={{ title: 'Members' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="edit-name" options={{ presentation: 'modal', title: '' }} />
      <Stack.Screen name="edit-theme" options={{ presentation: 'modal', title: '' }} />
      <Stack.Screen name="feed" options={{ title: 'Activity' }} />
      <Stack.Screen name="leaderboard" options={{ title: 'Leaderboard' }} />
    </Stack>
  );
}
