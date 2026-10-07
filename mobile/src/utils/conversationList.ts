import { Conversation, Message } from '../types';

export interface ConversationListUpdate {
  conversations: Conversation[];
  // The message belongs to a conversation this list doesn't know about,
  // so it can't be folded in locally and the caller should refetch. That
  // happens for a conversation someone else just started, and for one
  // this user had hidden - a new message un-hides it server-side (see
  // 20260805_add_hide_conversation.sql), which the client can only learn
  // about by asking again.
  needsRefetch: boolean;
}

// Folds a message that arrived over realtime into the already-loaded
// conversation list: refreshes the row's preview and moves it to the top.
//
// Move-to-front is the whole ordering rule, and it's enough: the list is
// sorted most-recent-activity first (conversations.updated_at, which a
// trigger now bumps on insert - see
// 20260909_bump_conversation_updated_at_on_message.sql), and a message
// arriving is by definition the most recent activity. Applying that per
// event keeps the list in the same order a fresh fetch would return,
// without re-sorting the whole array each time.
//
// Deliberately handles this user's *own* messages too, not just other
// people's - sending from ChatScreen and going back to the list should
// show the sent message as the preview, at the top.
export function applyIncomingMessage(
  conversations: Conversation[],
  message: Message,
): ConversationListUpdate {
  const index = conversations.findIndex((c) => c.id === message.conversation_id);
  if (index === -1) return { conversations, needsRefetch: true };

  const existing = conversations[index];
  const currentPreview = existing.messages?.[0];

  // Realtime can redeliver, and the sender also folds in its own insert
  // response - so an id we're already showing is a no-op rather than a
  // pointless re-render and re-sort.
  if (currentPreview?.id === message.id) {
    return { conversations, needsRefetch: false };
  }

  // Out-of-order delivery shouldn't roll the preview back to an older
  // message or promote the row on the strength of one.
  if (
    currentPreview &&
    new Date(message.created_at).getTime() < new Date(currentPreview.created_at).getTime()
  ) {
    return { conversations, needsRefetch: false };
  }

  const updated: Conversation = {
    ...existing,
    messages: [message],
    updated_at: message.created_at,
  };

  return {
    conversations: [
      updated,
      ...conversations.slice(0, index),
      ...conversations.slice(index + 1),
    ],
    needsRefetch: false,
  };
}

// The most conversations one person can pin. Pinning is only useful while
// it stays a short list - pin everything and nothing stands out.
export const MAX_PINNED_CONVERSATIONS = 3;

export function pinnedAtFor(conversation: Conversation, userId: string | null): string | null {
  return conversation.conversation_participants.find((p) => p.user_id === userId)?.pinned_at ?? null;
}

// Pinned conversations first, most recently pinned on top; everything else
// keeps the order it already had (most recent activity first - see
// applyIncomingMessage). Applied when the list renders rather than baked
// into the stored order, so it holds after a fresh fetch and after a
// realtime move-to-front alike. Returns the same array when nothing is
// pinned, so a memo over it stays cheap.
export function pinnedFirst(conversations: Conversation[], userId: string | null): Conversation[] {
  const pinned: Conversation[] = [];
  const rest: Conversation[] = [];
  for (const conversation of conversations) {
    (pinnedAtFor(conversation, userId) ? pinned : rest).push(conversation);
  }
  if (pinned.length === 0) return conversations;
  pinned.sort(
    (a, b) =>
      new Date(pinnedAtFor(b, userId) as string).getTime() -
      new Date(pinnedAtFor(a, userId) as string).getTime(),
  );
  return [...pinned, ...rest];
}

// The chips above the chat list.
export type ChatFilter = 'all' | 'unread' | 'groups';
export const CHAT_FILTERS: ChatFilter[] = ['all', 'unread', 'groups'];

// "Unread" means anything waiting for you - unread messages, or flagged
// with Mark as unread - the same rule that bolds a row.
export function matchesChatFilter(
  conversation: Conversation,
  filter: ChatFilter,
  userId: string | null,
  unreadCounts: Record<string, number>,
): boolean {
  if (filter === 'groups') return conversation.is_group;
  if (filter === 'unread') {
    const mine = conversation.conversation_participants.find((p) => p.user_id === userId);
    return (unreadCounts[conversation.id] ?? 0) > 0 || Boolean(mine?.marked_unread);
  }
  return true;
}
