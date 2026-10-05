import { supabase } from '../lib/supabase';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../config/env';

export interface LinkPreview {
  url: string;
  title: string;
  description: string | null;
  siteName: string | null;
  // The page's preview image - only ever loaded through the link-preview
  // function (see linkPreviewImageSource), never from its own host.
  imageUrl: string | null;
}

// Fetched by the link-preview Edge Function, never by the phone itself -
// see supabase/functions/link-preview for why. The server caches too;
// this in-memory map just stops the same bubble asking again every time
// it scrolls back into view. A failed request isn't remembered, so the
// next appearance tries again; "this page has nothing to preview" is.
const cache = new Map<string, Promise<LinkPreview | null>>();

export function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  const existing = cache.get(url);
  if (existing) return existing;

  const request = supabase.functions
    .invoke('link-preview', { body: { url } })
    .then(({ data, error }) => {
      if (error) throw error;
      return (data?.preview as LinkPreview | null) ?? null;
    })
    .catch(() => {
      cache.delete(url);
      return null;
    });
  cache.set(url, request);
  return request;
}

// A FastImage source for a preview's image, routed through the
// link-preview function so the phone never contacts the image's host -
// which would tell it every viewer's IP address, undoing the point of
// fetching previews server-side. The function only serves images a cached
// preview points at, and only to a signed-in user, hence the token.
export async function linkPreviewImageSource(
  imageUrl: string,
): Promise<{ uri: string; headers: Record<string, string> } | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  return {
    uri: `${SUPABASE_URL}/functions/v1/link-preview?image=${encodeURIComponent(imageUrl)}`,
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_PUBLISHABLE_KEY },
  };
}
