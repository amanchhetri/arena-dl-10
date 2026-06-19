import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

const TEN_MIN = 10 * 60 * 1000;

export function useSignedProofUrl(storagePath: string | null | undefined) {
  const inBucketPath = storagePath?.startsWith('proof/')
    ? storagePath.slice('proof/'.length)
    : (storagePath ?? null);

  return useQuery({
    queryKey: ['proof-signed-url', inBucketPath],
    enabled: Boolean(inBucketPath),
    staleTime: TEN_MIN,
    queryFn: async (): Promise<string | null> => {
      if (!inBucketPath) return null;
      const { data, error } = await supabase.storage
        .from('proof')
        .createSignedUrl(inBucketPath, 60 * 60);
      if (error) throw error;
      return data?.signedUrl ?? null;
    },
  });
}
