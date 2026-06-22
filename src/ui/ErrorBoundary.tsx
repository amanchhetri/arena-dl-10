import { Component, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { t } from '@/lib/i18n';

type Props = { children: ReactNode };
type State = { hasError: boolean; error?: Error };

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    Sentry.captureException(error, {
      contexts: { react: { componentStack: info.componentStack } },
    });
  }

  override render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View className="flex-1 items-center justify-center bg-bg-base px-6">
        <Text className="mb-3 font-display text-2xl text-text-primary">
          {t('errors.boundary.title')}
        </Text>
        <Text className="mb-8 text-center text-base text-text-muted">
          {t('errors.boundary.body')}
        </Text>
        <Pressable
          onPress={() => this.setState({ hasError: false, error: undefined })}
          className="rounded-2xl bg-primary-500 px-6 py-3"
        >
          <Text className="text-base font-semibold text-white">{t('errors.boundary.reload')}</Text>
        </Pressable>
      </View>
    );
  }
}
