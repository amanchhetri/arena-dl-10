import { useState } from 'react';
import { Modal, Pressable, SafeAreaView, Text, TextInput, View } from 'react-native';
import { Button } from '@/ui/Button';
import { t } from '@/lib/i18n';

type Props = {
  visible: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (email: string) => void;
};

export function EmailPromptSheet({ visible, busy, onClose, onSubmit }: Props) {
  const [email, setEmail] = useState('');

  function handleSubmit() {
    const trimmed = email.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  }

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <Pressable onPress={busy ? undefined : onClose} className="flex-1 bg-black/60" />
      <SafeAreaView className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-bg-elevated px-6 pb-8 pt-6">
        <View className="mx-auto mb-6 h-1 w-12 rounded-full bg-text-muted/40" />
        <Text className="mb-2 text-center font-display text-xl text-text-primary">
          {t('signIn.continueWithEmail')}
        </Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder={t('auth.emailPlaceholder')}
          placeholderTextColor="#8B8B98"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          editable={!busy}
          onSubmitEditing={handleSubmit}
          className="mb-4 mt-4 rounded-2xl bg-bg-surface px-4 py-3 text-base text-text-primary"
        />
        <Button disabled={busy || !email.trim()} onPress={handleSubmit}>
          {busy ? t('auth.sendingMagicLink') : t('signIn.continueWithEmail')}
        </Button>
        <View className="mt-3">
          <Button disabled={busy} onPress={onClose} variant="ghost">
            {t('auth.useDifferentEmail')}
          </Button>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
