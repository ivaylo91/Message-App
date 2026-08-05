import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import * as conversationsData from '../data/conversations';
import { Message } from '../types';

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

  // Bumps counts live for any conversation the user is in (RLS scopes
  // delivery to those, same as the messages table's select policy). See
  // ConversationsScreen/ChatScreen for the same stale-channel guard
  // pattern this is copied from - supabase.channel() reuses an existing
  // channel object still registered under this topic, and
  // removeChannel() is async, so a fast re-run of this effect (e.g. auth
  // state settling) could otherwise try to .on() an already-subscribed
  // channel and throw.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    void (async () => {
      const stale = supabase
        .getChannels()
        .find((c) => c.topic === 'realtime:unread-messages');
      if (stale) await supabase.removeChannel(stale);
      if (cancelled) return;

      channel = supabase
        .channel('unread-messages')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          (payload) => {
            const incoming = payload.new as Message;
            if (incoming.sender_id === userId) return;
            setUnreadCounts((current) => ({
              ...current,
              [incoming.conversation_id]: (current[incoming.conversation_id] ?? 0) + 1,
            }));
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [userId]);

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