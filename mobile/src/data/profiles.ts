import { supabase } from '../lib/supabase';
import { Profile } from '../types';

export async function searchProfiles(
  query: string,
  excludeUserId: string,
): Promise<Profile[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .neq('id', excludeUserId)
    .or(`display_name.ilike.%${trimmed}%,email.ilike.%${trimmed}%`)
    .limit(20);

  if (error) throw error;
  return data as Profile[];
}