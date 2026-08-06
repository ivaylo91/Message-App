import * as base64js from 'base64-js';
import { supabase } from '../lib/supabase';
import { getCachedSignedUrl } from '../lib/signedUrlCache';
import { Profile, ProfileSearchResult } from '../types';

const AVATAR_BUCKET = 'avatars';
// Long-lived (vs. the old 1h) since the URL is now cached to disk, not
// just in memory - see signedUrlCache.ts for why a stable URL across
// app restarts is what lets FastImage's own cache actually hit.
const AVATAR_SIGNED_URL_EXPIRY_SECONDS = 60 * 60 * 24;

// Phone numbers are stored/matched digit-only (plus a leading +) so that
// "+1 555-123-4567" and "5551234567" can find the same profile regardless
// of how either side typed the separators.
export function normalizePhone(input: string): string {
  const hasPlus = input.trim().startsWith('+');
  const digits = input.replace(/[^0-9]/g, '');
  return digits ? `${hasPlus ? '+' : ''}${digits}` : '';
}

// Runs server-side via the search_profiles() RPC (bound parameter, not a
// client-built filter string) - see 20260806_add_secure_search_profiles_rpc.sql
// for why: it closes both a filter-injection issue and a contact-info
// (email/phone) harvesting issue the previous client-side query had.
export async function searchProfiles(query: string): Promise<ProfileSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const { data, error } = await supabase.rpc('search_profiles', { query: trimmed });

  if (error) throw error;
  return data as ProfileSearchResult[];
}

export async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data as Profile;
}

export async function updateProfile(
  userId: string,
  updates: Partial<Pick<Profile, 'display_name' | 'avatar_path' | 'username' | 'phone'>>,
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  return data as Profile;
}

// A heartbeat, not a one-off - see PresenceContext, which calls this
// periodically while the app is active (and once more on backgrounding)
// so the timestamp stays close to someone's actual last-active moment
// even if the app is killed ungracefully rather than backgrounded
// cleanly. Best-effort by design: callers swallow failures here rather
// than surfacing them, since a missed heartbeat just means a slightly
// stale "last seen" for other people, not a broken feature.
export async function updateLastSeen(userId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) throw error;
}

export async function uploadAvatar(
  userId: string,
  base64Data: string,
  mimeType: string,
): Promise<string> {
  const ext = mimeType.split('/')[1] ?? 'jpg';
  const path = `${userId}/avatar.${ext}`;

  // Android's Photo Picker hands back a scoped content:// URI that RN's
  // fetch() can't read ("Network request failed") even though the same
  // fetch+blob call works for other local file sources. The picker
  // already reads the bytes itself when asked for base64, so decoding
  // that avoids touching the content:// URI a second time.
  const bytes = base64js.toByteArray(base64Data);

  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, bytes, { contentType: mimeType, upsert: true });

  if (error) throw error;
  return path;
}

// Client can't delete an auth.users row itself (needs the service role),
// so this just invokes the edge function that does - see
// supabase/functions/delete-account/index.ts for what it actually does
// server-side. Caller is responsible for clearing the local session
// afterwards; the account is gone but this device's stored tokens aren't.
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account');
  if (error) throw error;
}

export async function getAvatarUrl(path: string): Promise<string> {
  return getCachedSignedUrl(AVATAR_BUCKET, path, async () => {
    const { data, error } = await supabase.storage
      .from(AVATAR_BUCKET)
      .createSignedUrl(path, AVATAR_SIGNED_URL_EXPIRY_SECONDS);

    if (error) throw error;
    return { url: data.signedUrl, expirySeconds: AVATAR_SIGNED_URL_EXPIRY_SECONDS };
  });
}