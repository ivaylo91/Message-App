import { supabase } from '../lib/supabase';

const BUCKET = 'message-media';
const SIGNED_URL_EXPIRY_SECONDS = 3600;

export async function uploadMedia(
  conversationId: string,
  localUri: string,
  mimeType: string,
  fileNameHint?: string | null,
): Promise<string> {
  // For files, trust the real filename's extension over one guessed
  // from the mime type - many document mime types (e.g. .docx, .pptx)
  // don't map cleanly to a short extension the way image/* does.
  const hintExt = fileNameHint?.includes('.') ? fileNameHint.split('.').pop() : null;
  const ext = hintExt || mimeType.split('/')[1] || 'bin';
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