import { supabase } from '../lib/supabase';
import { Profile } from '../types';

const AVATAR_BUCKET = 'avatars';

// Phone numbers are stored/matched digit-only (plus a leading +) so that
// "+1 555-123-4567" and "5551234567" can find the same profile regardless
// of how either side typed the separators.
export function normalizePhone(input: string): string {
  const hasPlus = input.trim().startsWith('+');
  const digits = input.replace(/[^0-9]/g, '');
  return digits ? `${hasPlus ? '+' : ''}${digits}` : '';
}

export async function searchProfiles(
  query: string,
  excludeUserId: string,
): Promise<Profile[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const filters = [
    `display_name.ilike.%${trimmed}%`,
    `email.ilike.%${trimmed}%`,
    `username.ilike.%${trimmed}%`,
  ];
  const phoneQuery = normalizePhone(trimmed);
  if (phoneQuery) filters.push(`phone.ilike.%${phoneQuery}%`);

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .neq('id', excludeUserId)
    .or(filters.join(','))
    .limit(20);

  if (error) throw error;
  return data as Profile[];
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
  localUri: string,
  mimeType: string,
): Promise<string> {
  const ext = mimeType.split('/')[1] ?? 'jpg';
  const path = `${userId}/avatar.${ext}`;

  const response = await fetch(localUri);
  const blob = await response.blob();

  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, blob, { contentType: mimeType, upsert: true });

  if (error) throw error;
  return path;
}

export function getAvatarUrl(path: string): string {
  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
}