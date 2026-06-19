import { useMutation } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';
import { analytics } from '@/lib/analytics/client';

type Vars = { acceptId: string };

export class ProofPickCancelled extends Error {
  constructor() {
    super('User cancelled proof picker');
    this.name = 'ProofPickCancelled';
  }
}

export function useUploadProofPhoto() {
  return useMutation({
    mutationFn: async ({ acceptId }: Vars): Promise<string> => {
      const userId = useAuthStore.getState().session?.user.id;
      if (!userId) throw new Error('Not authenticated');

      analytics.track('proof_submission_started', { accept_id: acceptId, proof_type: 'photo' });

      const picker = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
        allowsEditing: false,
      });
      if (picker.canceled || !picker.assets[0]) throw new ProofPickCancelled();
      const asset = picker.assets[0];

      const compressed = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 1080, height: 1080 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
      );

      const startedAt = Date.now();
      const response = await fetch(compressed.uri);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();

      const path = `${userId}/${acceptId}.jpg`;
      const { error } = await supabase.storage
        .from('proof')
        .upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: true });
      if (error) throw error;

      analytics.track('proof_upload_completed', {
        accept_id: acceptId,
        ms_elapsed: Date.now() - startedAt,
        bytes: arrayBuffer.byteLength,
      });

      return `proof/${path}`;
    },
  });
}
