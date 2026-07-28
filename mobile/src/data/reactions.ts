import { supabase } from '../lib/supabase';
import { MessageReaction } from '../types';

export async function fetchReactions(
  conversationId: string,
): Promise<MessageReaction[]> {
  const { data, error } = await supabase
    .from('message_reactions')
    .select('*')
    .eq('conversation_id', conversationId);

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
