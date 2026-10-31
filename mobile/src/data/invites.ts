import { supabase } from '../lib/supabase';

export interface InvitePreview {
  conversation_id: string;
  name: string | null;
  member_count: number;
  is_member: boolean;
}

export async function getGroupInvite(conversationId: string): Promise<string> {
  const { data, error } = await supabase.rpc('get_group_invite', {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
  return data as string;
}

export async function resetGroupInvite(conversationId: string): Promise<string> {
  const { data, error } = await supabase.rpc('reset_group_invite', {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
  return data as string;
}

// Null for a link that's been reset or never existed.
export async function previewInvite(token: string): Promise<InvitePreview | null> {
  const { data, error } = await supabase.rpc('preview_group_invite', { p_token: token });
  if (error) throw error;
  return (data as InvitePreview[])[0] ?? null;
}

export async function joinByInvite(token: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_group_by_invite', { p_token: token });
  if (error) throw error;
  return data as string;
}
