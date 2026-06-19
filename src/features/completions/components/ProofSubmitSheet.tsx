import { Modal, Pressable, SafeAreaView, Text, View } from 'react-native';
import { Button } from '@/ui/Button';
import { t } from '@/lib/i18n';
import type { ProofType } from '@/types/database';

type Props = {
  visible: boolean;
  proofType: ProofType;
  onClose: () => void;
  onSubmitHonor: () => void;
  onPickPhoto: () => void;
  busy: boolean;
};

export function ProofSubmitSheet({
  visible,
  proofType,
  onClose,
  onSubmitHonor,
  onPickPhoto,
  busy,
}: Props) {
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <Pressable onPress={busy ? undefined : onClose} className="flex-1 bg-black/60" />
      <SafeAreaView className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-bg-elevated px-6 pb-8 pt-6">
        <View className="mx-auto mb-6 h-1 w-12 rounded-full bg-text-muted/40" />
        <Text className="mb-2 text-center font-display text-xl text-text-primary">
          {t('proof.sheetTitle')}
        </Text>

        {proofType === 'honor' ? (
          <>
            <Text className="mb-6 text-center text-base text-text-muted">
              {t('proof.honorPrompt')}
            </Text>
            <Button disabled={busy} onPress={onSubmitHonor}>
              {busy ? t('proof.uploading') : t('proof.honorConfirm')}
            </Button>
            <View className="mt-3">
              <Button disabled={busy} onPress={onClose} variant="ghost">
                {t('proof.honorCancel')}
              </Button>
            </View>
          </>
        ) : (
          <>
            <Button disabled={busy} onPress={onPickPhoto}>
              {busy ? t('proof.uploading') : t('proof.photoPick')}
            </Button>
            <View className="mt-3">
              <Button disabled onPress={() => undefined} variant="ghost">
                {t('proof.photoTake')}
              </Button>
            </View>
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}
