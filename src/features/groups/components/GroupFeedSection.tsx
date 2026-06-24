import { Pressable, Text, View } from 'react-native';
import { ActivityEventRow } from './ActivityEventRow';
import { useGroupFeed } from '../api/useGroupFeed';
import { t } from '@/lib/i18n';

type Props = {
  groupId: string;
  onSeeAll: () => void;
};

export function GroupFeedSection({ groupId, onSeeAll }: Props) {
  const { data: events } = useGroupFeed(groupId, 10);

  if (!events) return null;

  if (events.length === 0) {
    return (
      <View className="items-center rounded-2xl bg-bg-surface px-4 py-6">
        <Text className="mb-2 text-3xl">📭</Text>
        <Text className="text-center text-sm text-text-muted">{t('feed.empty.label')}</Text>
      </View>
    );
  }

  return (
    <View>
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-xs font-semibold tracking-widest text-text-muted">
          {t('feed.section.title')}
        </Text>
        <Pressable onPress={onSeeAll} className="active:opacity-60">
          <Text className="text-sm font-semibold text-primary-500">{t('feed.section.seeAll')}</Text>
        </Pressable>
      </View>
      <View className="gap-2">
        {events.map((e) => (
          <ActivityEventRow key={e.id} event={e} />
        ))}
      </View>
    </View>
  );
}
