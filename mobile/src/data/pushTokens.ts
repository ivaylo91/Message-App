import { supabase } from '../lib/supabase';

export async function registerPushToken(token: string): Promise<void> {
  // An FCM token is tied to the device/app install, not the signed-in
  // account - if a different user was previously signed in on this
  // same device, their row for this exact token needs to be released
  // first (RLS blocks a plain client-side upsert from doing that,
  // since it can only touch its own rows), or that account would keep
  // getting push notifications meant for whoever is using the device
  // now. claim_push_token is a SECURITY DEFINER RPC that does both
  // steps atomically.
  const { error } = await supabase.rpc('claim_push_token', {
    p_token: token,
    p_platform: 'android',
  });

  if (error) throw error;
}

export async function unregisterPushToken(token: string): Promise<void> {
  const { error } = await supabase.from('push_tokens').delete().eq('token', token);
  if (error) throw error;
}