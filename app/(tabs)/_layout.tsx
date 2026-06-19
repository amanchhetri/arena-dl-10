import { Tabs } from 'expo-router';
import { t } from '@/lib/i18n';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#A855F7',
        tabBarInactiveTintColor: '#8B8B98',
        tabBarStyle: { backgroundColor: '#16161C', borderTopColor: '#1F1F28' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.home') }} />
      <Tabs.Screen name="catalog" options={{ title: t('tabs.catalog') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile') }} />
    </Tabs>
  );
}
