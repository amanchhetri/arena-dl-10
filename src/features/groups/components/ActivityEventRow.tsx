import { Image, Text, View } from 'react-native';
import { useSignedProofUrl } from '@/features/completions/api/useSignedProofUrl';
import type { ActivityEventWithActor } from '../api/useGroupFeed';
import { t } from '@/lib/i18n';

type Props = { event: ActivityEventWithActor };

function AvatarCircle({ display }: { display: string }) {
  return (
    <View className="h-10 w-10 items-center justify-center rounded-full bg-primary-500/30">
      <Text className="font-display text-base text-text-primary">
        {display.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

export function ActivityEventRow({ event }: Props) {
  const actorName = event.actor?.username ?? '...';
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const proofUrl = typeof payload.proof_url === 'string' ? (payload.proof_url as string) : null;
  const { data: signedUrl } = useSignedProofUrl(proofUrl);

  if (event.event_type === 'challenge_completed') {
    const title = (payload.challenge_title as string) ?? 'a challenge';
    const xp = (payload.xp_awarded as number) ?? 0;
    return (
      <View className="rounded-2xl bg-bg-surface p-4">
        <View className="flex-row items-center gap-3">
          <AvatarCircle display={actorName} />
          <View className="flex-1">
            <Text className="text-text-primary">
              <Text className="font-semibold">@{actorName}</Text>{' '}
              <Text className="text-text-muted">
                {t('feed.events.challengeCompleted', { title })}
              </Text>
            </Text>
          </View>
          <View className="rounded-full bg-xp-gain/20 px-2 py-0.5">
            <Text className="text-xs font-semibold text-xp-gain">{t('feed.xpBadge', { xp })}</Text>
          </View>
        </View>
        {signedUrl && (
          <Image
            source={{ uri: signedUrl }}
            className="mt-3 h-48 w-full rounded-2xl"
            resizeMode="cover"
          />
        )}
      </View>
    );
  }

  if (event.event_type === 'joined_group') {
    return (
      <View className="flex-row items-center gap-3 rounded-2xl bg-bg-surface p-4">
        <AvatarCircle display={actorName} />
        <Text className="flex-1 text-text-primary">
          <Text className="font-semibold">@{actorName}</Text>{' '}
          <Text className="text-text-muted">{t('feed.events.joinedGroup')}</Text>
        </Text>
      </View>
    );
  }

  if (event.event_type === 'level_up') {
    const level = (payload.to_level as number) ?? 1;
    return (
      <View className="flex-row items-center gap-3 rounded-2xl bg-bg-surface p-4">
        <AvatarCircle display={actorName} />
        <Text className="flex-1 text-text-primary">
          <Text className="font-semibold">@{actorName}</Text>{' '}
          <Text className="text-text-muted">{t('feed.events.levelUp', { level })}</Text>
        </Text>
        <Text className="text-2xl">⭐</Text>
      </View>
    );
  }

  if (event.event_type === 'group_flame_lit') {
    return (
      <View className="flex-row items-center gap-3 rounded-2xl bg-flame-from/10 p-4">
        <Text className="text-2xl">🔥</Text>
        <Text className="flex-1 text-text-primary">{t('feed.events.flameLit')}</Text>
      </View>
    );
  }

  if (event.event_type === 'group_flame_milestone') {
    const streak = (payload.streak_length as number) ?? 0;
    return (
      <View className="flex-row items-center gap-3 rounded-2xl bg-flame-from/15 p-4">
        <Text className="text-2xl">🔥</Text>
        <Text className="flex-1 font-semibold text-flame-from">
          {t('feed.events.flameMilestone', { streak })}
        </Text>
      </View>
    );
  }

  // group_flame_broken
  return (
    <View className="flex-row items-center gap-3 rounded-2xl bg-bg-elevated p-4">
      <Text className="text-2xl">🪦</Text>
      <Text className="flex-1 text-text-muted">{t('feed.events.flameBroken')}</Text>
    </View>
  );
}
