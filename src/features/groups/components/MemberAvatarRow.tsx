import { Text, View } from 'react-native';
import type { MemberWithProfile } from '../api/useGroupMembers';

type Props = { members: MemberWithProfile[]; maxShown?: number };

export function MemberAvatarRow({ members, maxShown = 5 }: Props) {
  const shown = members.slice(0, maxShown);
  const extra = Math.max(0, members.length - maxShown);
  return (
    <View className="flex-row items-center">
      {shown.map((m, idx) => (
        <View
          key={m.user_id}
          className="h-10 w-10 items-center justify-center rounded-full border-2 border-bg-base bg-primary-500/30"
          style={{ marginLeft: idx === 0 ? 0 : -8 }}
        >
          <Text className="font-display text-base text-text-primary">
            {(m.user.username ?? '?').slice(0, 1).toUpperCase()}
          </Text>
        </View>
      ))}
      {extra > 0 && (
        <View
          className="h-10 w-10 items-center justify-center rounded-full border-2 border-bg-base bg-bg-elevated"
          style={{ marginLeft: -8 }}
        >
          <Text className="text-xs font-semibold text-text-muted">+{extra}</Text>
        </View>
      )}
    </View>
  );
}
