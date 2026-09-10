export interface UnreadSummary {
  // Every unread message across every conversation - what the bell badge
  // shows ("you have 12 messages waiting").
  totalMessages: number;
  // How many conversations have anything unread at all - what the chats
  // badge shows, the way Messenger counts threads rather than messages.
  conversationsWithUnread: number;
}

// A conversation can legitimately sit at 0 in the map - markConversationRead
// removes its key, but a refresh can also return a 0, and a 0 must not
// count as an unread thread.
export function summarizeUnread(
  unreadCounts: Record<string, number>,
): UnreadSummary {
  let totalMessages = 0;
  let conversationsWithUnread = 0;

  for (const count of Object.values(unreadCounts)) {
    if (count > 0) {
      totalMessages += count;
      conversationsWithUnread += 1;
    }
  }

  return { totalMessages, conversationsWithUnread };
}
