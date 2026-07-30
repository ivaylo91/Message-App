import { supabase } from '../lib/supabase';
import { AttachmentType, Conversation, Message } from '../types';

const CONVERSATION_SELECT = '*, conversation_participants(*, profiles(*))';

export async function fetchConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select(
      `${CONVERSATION_SELECT}, messages(id, body, media_path, attachment_type, attachment_name, created_at, sender_id)`,
    )
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false, referencedTable: 'messages' })
    .limit(1, { referencedTable: 'messages' });

  if (error) throw error;
  return data as unknown as Conversation[];
}

export async function fetchUnreadCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('unread_message_counts');
  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const row of data as { conversation_id: string; unread_count: number }[]) {
    counts[row.conversation_id] = row.unread_count;
  }
  return counts;
}

export async function fetchConversation(
  conversationId: string,
): Promise<Conversation> {
  const { data, error } = await supabase
    .from('conversations')
    .select(CONVERSATION_SELECT)
    .eq('id', conversationId)
    .single();

  if (error) throw error;
  return data as unknown as Conversation;
}

export async function createConversation(
  participantIds: string[],
  name?: string,
): Promise<Conversation> {
  const { data, error } = await supabase.rpc('create_conversation', {
    participant_ids: participantIds,
    p_is_group: participantIds.length > 1,
    p_name: name ?? null,
  });

  if (error) throw error;
  return data as unknown as Conversation;
}

const MESSAGE_SELECT =
  '*, reply_to:reply_to_message_id(id, body, media_path, attachment_type, attachment_name, sender_id, deleted_at, profiles(*))';

export async function fetchMessages(
  conversationId: string,
): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select(MESSAGE_SELECT)
    .eq('conversation_id', conversationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data as unknown as Message[];
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  body: string,
  replyToMessageId?: string | null,
): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      body,
      reply_to_message_id: replyToMessageId ?? null,
    })
    .select(MESSAGE_SELECT)
    .single();

  if (error) throw error;
  return data as unknown as Message;
}

interface AttachmentInput {
  path: string;
  type: AttachmentType;
  name?: string | null;
  mimeType?: string | null;
  durationMs?: number | null;
  replyToMessageId?: string | null;
}

export async function sendAttachmentMessage(
  conversationId: string,
  senderId: string,
  attachment: AttachmentInput,
): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      media_path: attachment.path,
      attachment_type: attachment.type,
      attachment_name: attachment.name ?? null,
      attachment_mime_type: attachment.mimeType ?? null,
      attachment_duration_ms: attachment.durationMs ?? null,
      reply_to_message_id: attachment.replyToMessageId ?? null,
    })
    .select(MESSAGE_SELECT)
    .single();

  if (error) throw error;
  return data as unknown as Message;
}

export async function markConversationRead(
  conversationId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function editMessage(
  messageId: string,
  body: string,
): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .update({ body, edited_at: new Date().toISOString() })
    .eq('id', messageId)
    .select()
    .single();

  if (error) throw error;
  return data as Message;
}

export async function deleteMessage(messageId: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', messageId);

  if (error) throw error;
}
