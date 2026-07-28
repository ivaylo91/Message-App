import { supabase } from '../lib/supabase';

export async function registerPushToken(
  userId: string,
  token: string,
): Promise<void> {
  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      { user_id: userId, token, platform: 'android', updated_at: new Date().toISOString() },
      { onConflict: 'user_id,token' },
    );

  if (error) throw error;
}

export async function unregisterPushToken(token: string): Promise<void> {
  const { error } = await supabase.from('push_tokens').delete().eq('token', token);
  if (error) throw error;
}