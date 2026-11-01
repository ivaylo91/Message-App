import { GIPHY_API_KEY } from '../config/env';
import { gifUrlOf } from '../utils/gif';

// Called from the phone, unlike link previews, because GIPHY requires it:
// "Do not proxy requests to GIPHY, either API calls or media URL loads."
// https://developers.giphy.com/docs/api/
//
// The same rules forbid reordering results and altering the URLs that come
// back, so results keep GIPHY's order and URLs are stored untouched.
const API_URL = 'https://api.giphy.com/v1/gifs';
export const GIF_PAGE_SIZE = 24;
const RATING = 'pg';

export interface GifResult {
  id: string;
  title: string;
  // Small, for the picker's grid.
  previewUrl: string;
  // What the message carries: downsized stays under 2MB.
  sendUrl: string;
}

export interface GifPage {
  gifs: GifResult[];
  // Null when there's nothing more to fetch.
  nextOffset: number | null;
}

interface GiphyRendition {
  url?: string;
  webp?: string;
}

interface GiphyGif {
  id: string;
  title?: string;
  images?: {
    fixed_width_small?: GiphyRendition;
    downsized?: GiphyRendition;
  };
}

interface GiphyResponse {
  data?: GiphyGif[];
  pagination?: { total_count?: number; count?: number; offset?: number };
}

export function parseGifPage(response: GiphyResponse, offset: number): GifPage {
  const gifs = (response.data ?? []).flatMap((gif) => {
    const small = gif.images?.fixed_width_small;
    const full = gif.images?.downsized;
    const previewUrl = small?.webp ?? small?.url;
    const sendUrl = full?.webp ?? full?.url;
    // Only ever a malformed entry: without these there's nothing to show,
    // and a send URL the bubble wouldn't recognise would arrive as raw text.
    if (!previewUrl || !gifUrlOf(sendUrl)) return [];
    return [{ id: gif.id, title: gif.title ?? '', previewUrl, sendUrl: sendUrl as string }];
  });

  const count = response.pagination?.count ?? response.data?.length ?? 0;
  const total = response.pagination?.total_count ?? 0;
  const next = offset + count;
  return { gifs, nextOffset: count > 0 && next < total ? next : null };
}

// An empty query means what's trending, which is what the picker opens on.
export function gifRequestUrl(query: string, offset: number, language: string): string {
  const params = [
    `api_key=${encodeURIComponent(GIPHY_API_KEY)}`,
    `limit=${GIF_PAGE_SIZE}`,
    `offset=${offset}`,
    `rating=${RATING}`,
  ];
  if (!query) return `${API_URL}/trending?${params.join('&')}`;
  params.push(`q=${encodeURIComponent(query)}`, `lang=${encodeURIComponent(language)}`);
  return `${API_URL}/search?${params.join('&')}`;
}

export async function fetchGifs(query: string, offset: number, language: string): Promise<GifPage> {
  const response = await fetch(gifRequestUrl(query, offset, language));
  if (!response.ok) throw new Error(`GIPHY responded ${response.status}`);
  return parseGifPage((await response.json()) as GiphyResponse, offset);
}
