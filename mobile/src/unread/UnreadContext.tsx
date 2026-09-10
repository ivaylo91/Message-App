import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from '../auth/AuthContext';
import { useMessageStream } from '../messages/MessageStreamContext';
import * as conversationsData from '../data/conversations';

interface UnreadContextValue {
  unreadCounts: Record<string, number>;
  totalUnread: number;
  markConversationRead: (conversationId: string) => void;
  refresh: () => Promise<void>;
}

const UnreadContext = createContext<UnreadContextValue>({
  unreadCounts: {},
  totalUnread: 0,
  markConversationRead: () => {},
  refresh: async () => {},
});

// Single global source of truth for unread counts, shared by the
// per-conversation badges in ConversationsScreen and the total-count
// badge on FooterNav's "chats" tab - previously each screen tracked its
// own copy, which meant the footer had no way to know the total.
export function UnreadProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const { subscribe } = useMessageStream();
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    if (!userId) {
      setUnreadCounts({});
      return;
    }
    const counts = await conversationsData.fetchUnreadCounts();
    setUnreadCounts(counts);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Bumps counts live for any conversation the user is in - the channel
  // itself belongs to MessageStreamProvider, which is also what feeds
  // the conversation list's previews, so a message crosses the wire once
  // rather than once per feature that wants it.
  useEffect(() => {
    if (!userId) return;
    return subscribe((incoming) => {
      if (incoming.sender_id === userId) return;
      setUnreadCounts((current) => ({
        ...current,
        [incoming.conversation_id]: (current[incoming.conversation_id] ?? 0) + 1,
      }));
    });
  }, [userId, subscribe]);

  const markConversationRead = useCallback(
    (conversationId: string) => {
      if (!userId) return;
      setUnreadCounts((current) => {
        if (!current[conversationId]) return current;
        const next = { ...current };
        delete next[conversationId];
        return next;
      });
      conversationsData.markConversationRead(conversationId, userId).catch(() => {
        // best-effort - a missed read receipt isn't worth surfacing an error for
      });
    },
    [userId],
  );

  const totalUnread = useMemo(
    () => Object.values(unreadCounts).reduce((sum, count) => sum + count, 0),
    [unreadCounts],
  );

  const value = useMemo<UnreadContextValue>(
    () => ({ unreadCounts, totalUnread, markConversationRead, refresh }),
    [unreadCounts, totalUnread, markConversationRead, refresh],
  );

  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}

export function useUnread(): UnreadContextValue {
  return useContext(UnreadContext);
}