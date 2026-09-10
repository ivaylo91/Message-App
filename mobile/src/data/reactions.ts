import { supabase } from '../lib/supabase';
import { MessageReaction } from '../types';

// Scoped to the messages actually on screen, not the whole conversation.
// ChatScreen loads history 50 messages at a time (MESSAGE_PAGE_SIZE), but
// this used to fetch every reaction the conversation had ever
// accumulated on the first render - unbounded, and growing with the
// conversation rather than with what's being displayed. Each page of
// history now pulls its own reactions alongside it.
export async function fetchReactionsForMessages(
  messageIds: string[],
): Promise<MessageReaction[]> {
  if (messageIds.length === 0) return [];

  const { data, error } = await supabase
    .from('message_reactions')
    .select('*')
    .in('message_id', messageIds);

  if (error) throw error;
  return data as MessageReaction[];
}

export async function addReaction(
  messageId: string,
  conversationId: string,
  userId: string,
  emoji: string,
): Promise<MessageReaction> {
  const { data, error } = await supabase
    .from('message_reactions')
    .insert({
      message_id: messageId,
      conversation_id: conversationId,
      user_id: userId,
      emoji,
    })
    .select()
    .single();

  if (error) throw error;
  return data as MessageReaction;
}

export async function removeReaction(
  messageId: string,
  userId: string,
  emoji: string,
): Promise<void> {
  const { error } = await supabase
    .from('message_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('user_id', userId)
    .eq('emoji', emoji);

  if (error) throw error;
}
