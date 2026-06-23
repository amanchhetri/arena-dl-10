import { Tabs } from 'expo-router';
import { Icon, ICON_DEFAULTS } from '@/lib/icons';
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
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color }) => <Icon.Home {...ICON_DEFAULTS} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="catalog"
        options={{
          title: t('tabs.catalog'),
          tabBarIcon: ({ color }) => <Icon.Catalog {...ICON_DEFAULTS} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: t('tabs.groups'),
          tabBarIcon: ({ color }) => <Icon.Groups {...ICON_DEFAULTS} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color }) => <Icon.Profile {...ICON_DEFAULTS} color={color as string} />,
        }}
      />
    </Tabs>
  );
}
