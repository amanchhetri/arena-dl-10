import * as Clipboard from 'expo-clipboard';
import { Alert, Pressable, Text, View } from 'react-native';
import { Button } from '@/ui/Button';
import { t } from '@/lib/i18n';

type Props = {
  code: string;
  isOwner: boolean;
  onShare: () => void;
  onRegenerate?: () => void;
  regenerating?: boolean;
};

export function InviteCodeCard({ code, isOwner, onShare, onRegenerate, regenerating }: Props) {
  async function handleCopy() {
    await Clipboard.setStringAsync(code);
    Alert.alert(t('groups.home.codeCopied'));
  }

  return (
    <View className="rounded-2xl bg-bg-surface p-4">
      <Text className="mb-2 text-xs font-semibold tracking-widest text-text-muted">
        {t('groups.home.inviteCode')}
      </Text>
      <Pressable onPress={handleCopy} className="mb-3 active:opacity-60">
        <Text className="font-display text-2xl text-text-primary">{code}</Text>
      </Pressable>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button onPress={onShare}>{t('groups.home.share')}</Button>
        </View>
        {isOwner && onRegenerate && (
          <View className="flex-1">
            <Button variant="ghost" onPress={onRegenerate} disabled={regenerating}>
              {t('groups.home.regenerate')}
            </Button>
          </View>
        )}
      </View>
    </View>
  );
}
