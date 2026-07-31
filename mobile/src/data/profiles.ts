import * as base64js from 'base64-js';
import { supabase } from '../lib/supabase';
import { Profile, ProfileSearchResult } from '../types';

const AVATAR_BUCKET = 'avatars';
const AVATAR_SIGNED_URL_EXPIRY_SECONDS = 3600;

// Avatars are now served from a private bucket via short-lived signed
// URLs (see 20260807_make_avatars_bucket_private.sql), not permanent
// public ones. Avatar renders happen a lot - the same path shows up in
// headers, conversation rows, and chat bubbles at once - so this cache
// avoids re-requesting a signed URL for a path that's already got a
// still-valid one.
const avatarUrlCache = new Map<string, { url: string; expiresAt: number }>();

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

export async function getAvatarUrl(path: string): Promise<string> {
  const cached = avatarUrlCache.get(path);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.url;

  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(path, AVATAR_SIGNED_URL_EXPIRY_SECONDS);

  if (error) throw error;

  // Expire the cache entry a minute early so a render never hands out a
  // URL that's about to be rejected mid-flight.
  avatarUrlCache.set(path, {
    url: data.signedUrl,
    expiresAt: now + AVATAR_SIGNED_URL_EXPIRY_SECONDS * 1000 - 60_000,
  });
  return data.signedUrl;
}