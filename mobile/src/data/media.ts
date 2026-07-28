import { supabase } from '../lib/supabase';

const BUCKET = 'message-media';
const SIGNED_URL_EXPIRY_SECONDS = 3600;

export async function uploadMedia(
  conversationId: string,
  localUri: string,
  mimeType: string,
): Promise<string> {
  const ext = mimeType.split('/')[1] ?? 'jpg';
  const path = `${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const response = await fetch(localUri);
  const blob = await response.blob();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: mimeType });

  if (error) throw error;
  return path;
}

export async function getMediaSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);

  if (error) throw error;
  return data.signedUrl;
}