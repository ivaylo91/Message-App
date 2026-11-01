import { supabase } from '../lib/supabase';
import { PollVote } from '../types';

// Scoped to the polls actually loaded, the same way reactions are.
export async function fetchPollVotes(messageIds: string[]): Promise<PollVote[]> {
  if (messageIds.length === 0) return [];

  const { data, error } = await supabase
    .from('poll_votes')
    .select('message_id, user_id, conversation_id, option_index')
    .in('message_id', messageIds);

  if (error) throw error;
  return data as PollVote[];
}

// Null withdraws this person's vote. See 20261101_add_polls.sql.
export async function castPollVote(
  messageId: string,
  optionIndex: number | null,
): Promise<void> {
  const { error } = await supabase.rpc('cast_poll_vote', {
    p_message_id: messageId,
    p_option_index: optionIndex,
  });

  if (error) throw error;
}
