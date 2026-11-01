import { supabase } from '../lib/supabase';
import { AttachmentType } from '../types';

export interface SavedMessage {
  id: string;
  conversation_id: string;
  body: string | null;
  attachment_type: AttachmentType | null;
  attachment_name: string | null;
  created_at: string;
  profiles: { display_name: string } | null;
}

export async function fetchSavedMessages(): Promise<SavedMessage[]> {
  const { data, error } = await supabase
    .from('saved_messages')
    .select(
      'saved_at, messages(id, conversation_id, body, attachment_type, attachment_name, created_at, deleted_at, profiles!messages_sender_id_fkey(display_name))',
    )
    .order('saved_at', { ascending: false });
  if (error) throw error;

  // Null when RLS no longer lets this person read it (they left the group);
  // a deleted message stays in the table but has nothing left to show.
  const rows = data as unknown as { messages: (SavedMessage & { deleted_at: string | null }) | null }[];
  return rows.flatMap((row) => (row.messages && !row.messages.deleted_at ? [row.messages] : []));
}

export async function fetchSavedMessageIds(): Promise<Set<string>> {
  const { data, error } = await supabase.from('saved_messages').select('message_id');
  if (error) throw error;
  return new Set(data.map((row) => row.message_id as string));
}

export async function saveMessage(userId: string, messageId: string): Promise<void> {
  const { error } = await supabase
    .from('saved_messages')
    .insert({ user_id: userId, message_id: messageId });
  if (error) throw error;
}

export async function unsaveMessage(userId: string, messageId: string): Promise<void> {
  const { error } = await supabase
    .from('saved_messages')
    .delete()
    .eq('user_id', userId)
    .eq('message_id', messageId);
  if (error) throw error;
}
