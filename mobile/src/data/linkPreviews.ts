import { supabase } from '../lib/supabase';

export interface LinkPreview {
  url: string;
  title: string;
  description: string | null;
  siteName: string | null;
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
