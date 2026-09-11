import { supabase } from '../lib/supabase';
import { escapeLikePattern } from '../utils/likePattern';
import { AttachmentType, CallStatus, Conversation, Message } from '../types';

const CONVERSATION_SELECT = '*, conversation_participants(*, profiles(*))';

export async function fetchConversations(userId: string): Promise<Conversation[]> {
  const { data: hiddenRows, error: hiddenError } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', userId)
    .not('hidden_at', 'is', null);

  if (hiddenError) throw hiddenError;
  const hiddenIds = hiddenRows.map((row) => row.conversation_id);

  let query = supabase
    .from('conversations')
    .select(
      `${CONVERSATION_SELECT}, messages(id, body, media_path, attachment_type, attachment_name, attachment_duration_ms, call_status, created_at, sender_id)`,
    )
    // Filters the embedded messages, not the conversations themselves
    // (that would need !inner) - so a conversation whose only messages
    // are deleted still appears, just with an empty preview. Without
    // this, deleting the newest message left the list previewing it:
    // the embedded select takes the single most recent row regardless of
    // deleted_at, unlike fetchMessages which has always filtered.
    .is('messages.deleted_at', null)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false, referencedTable: 'messages' })
    .limit(1, { referencedTable: 'messages' });

  if (hiddenIds.length > 0) {
    query = query.not('id', 'in', `(${hiddenIds.join(',')})`);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data as unknown as Conversation[];
}

// "Delete chat" - hides the conversation from just this user's own list
// (see 20260805_add_hide_conversation.sql). The other participant(s) and
// the message history are untouched, and a new message arriving in the
// conversation clears this automatically.
export async function hideConversation(
  conversationId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('conversation_participants')
    .update({ hidden_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId);

  if (error) throw error;
}

// Mute is per participant, so this only ever writes the caller's own row -
// which is also all the RLS policy permits (verified: updating another
// participant's row affects zero rows). Pass null to unmute.
export async function setConversationMuted(
  conversationId: string,
  userId: string,
  mutedUntil: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('conversation_participants')
    .update({ muted_until: mutedUntil })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId);

  if (error) throw error;
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

// ChatScreen's page size for both the initial load and each older page it
// fetches as the user scrolls up - see loadMoreMessages there.
export const MESSAGE_PAGE_SIZE = 50;

// `before` pages in older history: pass the created_at of the oldest
// message currently loaded to get the next 50 before it. Cursor-based
// (like fetchMediaMessages) rather than offset-based, so it stays correct
// under concurrent inserts.
export async function fetchMessages(
  conversationId: string,
  before?: string,
): Promise<Message[]> {
  let query = supabase
    .from('messages')
    .select(MESSAGE_SELECT)
    .eq('conversation_id', conversationId)
    .is('deleted_at', null);

  if (before) query = query.lt('created_at', before);

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(MESSAGE_PAGE_SIZE);

  if (error) throw error;
  return data as unknown as Message[];
}

export interface MessageSearchResult {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

// Searches the whole conversation, not just the ~50 most recent messages
// ChatScreen normally has loaded - see fetchMessagesAround for how a
// result outside that window gets pulled into view. .ilike() sends the
// pattern as a bound parameter (unlike the old .or() filter string this
// codebase used to build for profile search - see
// 20260806_add_secure_search_profiles_rpc.sql), so this isn't the same
// filter-injection shape - escapeLikePattern here is only about % and _
// in the search text itself being treated as literal characters rather
// than wildcards, not about injection.
export async function searchMessages(
  conversationId: string,
  query: string,
): Promise<MessageSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const { data, error } = await supabase
    .from('messages')
    .select('id, sender_id, body, created_at')
    .eq('conversation_id', conversationId)
    .is('deleted_at', null)
    .not('body', 'is', null)
    .ilike('body', `%${escapeLikePattern(trimmed)}%`)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) throw error;
  return data as MessageSearchResult[];
}

export interface MediaMessage {
  id: string;
  media_path: string;
  attachment_type: AttachmentType;
  attachment_name: string | null;
  attachment_mime_type: string | null;
  attachment_duration_ms: number | null;
  created_at: string;
}

const MEDIA_PAGE_SIZE = 30;

// Backs the media gallery (MediaGalleryScreen) - a dedicated view of
// everything ever shared in a conversation, independent of the ~50
// most-recent-messages window ChatScreen normally keeps loaded. Cursor-
// paginated on created_at (pass the last item's created_at back in as
// `cursor` for the next page), matching fetchMessagesAround's approach
// rather than offset-based .range(), since offsets shift under
// concurrent inserts.
export async function fetchMediaMessages(
  conversationId: string,
  kind: 'photos' | 'files',
  cursor?: string,
): Promise<MediaMessage[]> {
  let query = supabase
    .from('messages')
    .select(
      'id, media_path, attachment_type, attachment_name, attachment_mime_type, attachment_duration_ms, created_at',
    )
    .eq('conversation_id', conversationId)
    .is('deleted_at', null)
    .not('media_path', 'is', null);

  query =
    kind === 'photos'
      ? query.eq('attachment_type', 'image')
      : query.in('attachment_type', ['file', 'audio']);

  if (cursor) query = query.lt('created_at', cursor);

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(MEDIA_PAGE_SIZE);

  if (error) throw error;
  return data as MediaMessage[];
}

// Loads a fresh window of messages centered on a specific message (a
// search result the user tapped) that's further back than what's
// currently loaded - jumping straight there and fetching around it is
// far cheaper than scrolling ChatScreen's normal page-by-page history
// loading all the way back to it.
export async function fetchMessagesAround(
  conversationId: string,
  anchorMessageId: string,
): Promise<Message[]> {
  const { data: anchor, error: anchorError } = await supabase
    .from('messages')
    .select('created_at')
    .eq('id', anchorMessageId)
    .single();

  if (anchorError) throw anchorError;

  const [olderOrEqual, newer] = await Promise.all([
    supabase
      .from('messages')
      .select(MESSAGE_SELECT)
      .eq('conversation_id', conversationId)
      .is('deleted_at', null)
      .lte('created_at', anchor.created_at)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('messages')
      .select(MESSAGE_SELECT)
      .eq('conversation_id', conversationId)
      .is('deleted_at', null)
      .gt('created_at', anchor.created_at)
      .order('created_at', { ascending: true })
      .limit(20),
  ]);

  if (olderOrEqual.error) throw olderOrEqual.error;
  if (newer.error) throw newer.error;

  // Both halves ordered so the merged array stays newest-first, matching
  // fetchMessages - ChatScreen's FlatList is inverted and expects that.
  return [
    ...(newer.data as unknown as Message[]).reverse(),
    ...(olderOrEqual.data as unknown as Message[]),
  ];
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

// Written once, by the caller, after a call ends - see CallContext.tsx
// for why only the caller's side logs it (both participants read the
// same row since it's a normal message in their shared conversation).
export async function sendCallLogMessage(
  conversationId: string,
  senderId: string,
  callStatus: CallStatus,
  durationMs: number | null,
): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      call_status: callStatus,
      attachment_duration_ms: durationMs,
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

// Group management goes through SECURITY DEFINER RPCs rather than direct
// table writes, for the same reason create_conversation does: whether
// this user may rename a group, or add/remove somebody else, depends on
// their role in a *different* row, which simple per-row RLS can't check.
// See 20260910_add_group_management.sql - the RPCs enforce that only an
// admin can rename or add, that anyone may remove themselves (leaving),
// and that a group is never left without an admin.

export async function renameConversation(
  conversationId: string,
  name: string,
): Promise<void> {
  const { error } = await supabase.rpc('rename_conversation', {
    p_conversation_id: conversationId,
    p_name: name,
  });

  if (error) throw error;
}

export async function addConversationParticipants(
  conversationId: string,
  userIds: string[],
): Promise<void> {
  if (userIds.length === 0) return;

  const { error } = await supabase.rpc('add_conversation_participants', {
    p_conversation_id: conversationId,
    p_user_ids: userIds,
  });

  if (error) throw error;
}

// Also the "leave group" path - pass your own id. The RPC allows that
// unconditionally and only requires admin for removing somebody else.
export async function removeConversationParticipant(
  conversationId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase.rpc('remove_conversation_participant', {
    p_conversation_id: conversationId,
    p_user_id: userId,
  });

  if (error) throw error;
}
