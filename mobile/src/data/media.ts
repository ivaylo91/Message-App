import { supabase } from '../lib/supabase';
import { getCachedSignedUrl } from '../lib/signedUrlCache';

const BUCKET = 'message-media';
// Long-lived and cached to disk (see signedUrlCache.ts) so the same URL
// - and therefore FastImage's own cached bytes for it - survives an app
// restart instead of every cold start re-downloading every attachment.
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60 * 24;

// Extensions only ever need to be a short alphanumeric tag (jpg, docx,
// heic, ...) - anything else (path separators, dots, traversal
// sequences) means the "extension" isn't one, so it's discarded rather
// than trusted into the storage path below. See uploadMedia.
const SAFE_EXTENSION_PATTERN = /^[a-zA-Z0-9]{1,10}$/;

export async function uploadMedia(
  conversationId: string,
  localUri: string,
  mimeType: string,
  fileNameHint?: string | null,
): Promise<string> {
  // For files, trust the real filename's extension over one guessed
  // from the mime type - many document mime types (e.g. .docx, .pptx)
  // don't map cleanly to a short extension the way image/* does. The
  // filename itself is user-controlled (whatever they picked from their
  // device), so the extracted candidate is validated against a strict
  // allowlist before it's trusted into the storage path - a crafted
  // name like "../../../etc/passwd" (no real extension) would otherwise
  // have '/etc/passwd' extracted as its "extension" and end up embedded
  // directly in the object key.
  const rawHintExt = fileNameHint?.includes('.') ? fileNameHint.split('.').pop() : null;
  const hintExt = rawHintExt && SAFE_EXTENSION_PATTERN.test(rawHintExt) ? rawHintExt : null;
  const mimeExt = mimeType.split('/')[1];
  const ext = hintExt || (mimeExt && SAFE_EXTENSION_PATTERN.test(mimeExt) ? mimeExt : 'bin');
  const path = `${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const response = await fetch(localUri);
  // React Native's Blob/FormData bridge drops local audio uploads on
  // Android - Storage rejects them with a 400 (confirmed in the project's
  // storage logs) even though the identical path works for photos/files.
  // Reading the response as an ArrayBuffer instead sends the raw bytes
  // directly and is reliable on both platforms.
  const arrayBuffer = await response.arrayBuffer();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, arrayBuffer, { contentType: mimeType });

  if (error) throw error;
  return path;
}

export async function getMediaSignedUrl(path: string): Promise<string> {
  return getCachedSignedUrl(BUCKET, path, async () => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);

    if (error) throw error;
    return { url: data.signedUrl, expirySeconds: SIGNED_URL_EXPIRY_SECONDS };
  });
}