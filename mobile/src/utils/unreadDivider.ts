import type { Message } from '../types';

// Which message the "New messages" divider sits above, when a chat is
// opened with `unreadCount` unread: the oldest of the newest
// `unreadCount` messages from other people. Mirrors how the count itself
// is made (unread_message_counts): other people's messages, not deleted.
//
// `messages` is newest-first, as ChatScreen holds them. If fewer unread
// messages are loaded than the count says (the count reaches further back
// than the first page), the divider goes above the oldest one loaded -
// still the right side of everything that's new.
export function unreadDividerMessageId(
  messages: Pick<Message, 'id' | 'sender_id' | 'deleted_at'>[],
  unreadCount: number,
  myUserId: string | null,
): string | null {
  if (unreadCount <= 0) return null;
  let found = 0;
  let last: string | null = null;
  for (const message of messages) {
    if (message.sender_id === myUserId || message.deleted_at) continue;
    last = message.id;
    found += 1;
    if (found === unreadCount) return message.id;
  }
  return last;
}
