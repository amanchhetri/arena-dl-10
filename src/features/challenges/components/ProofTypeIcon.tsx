import { Text } from 'react-native';
import type { ProofType } from '@/types/database';

const glyph: Record<ProofType, string> = {
  honor: '✋',
  photo: '📷',
  video: '🎥',
  peer: '👥',
};

export function ProofTypeIcon({ proofType }: { proofType: ProofType }) {
  return <Text className="text-xs text-text-muted">{glyph[proofType]}</Text>;
}
