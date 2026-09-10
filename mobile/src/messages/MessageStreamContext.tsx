import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { Message } from '../types';

// One app-wide subscription to message inserts, fanned out to whoever
// cares. Two features need the same stream - unread badges
// (UnreadContext) and the conversation list's preview/ordering
// (ConversationsScreen) - and giving each its own channel would mean
// every message crossing the wire twice, plus a second copy of the
// stale-channel dance below to get wrong.
//
// There's no conversation filter: RLS on the messages table decides what
// this user is allowed to receive, which is exactly "messages in
// conversations they're a participant of". Handlers get everything,
// including this user's own sent messages, and filter for themselves -
// unread counts skip their own, the conversation list doesn't.
const TOPIC = 'message-stream';

type NewMessageHandler = (message: Message) => void;

interface MessageStreamContextValue {
  // Registers a handler for as long as the caller is mounted; returns the
  // matching unsubscribe for the effect's cleanup.
  subscribe: (handler: NewMessageHandler) => () => void;
}

const MessageStreamContext = createContext<MessageStreamContextValue>({
  subscribe: () => () => {},
});

export function MessageStreamProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const handlersRef = useRef<Set<NewMessageHandler>>(new Set());

  // A Set in a ref rather than state: adding or removing a handler must
  // not re-run the effect below, or every subscriber mounting would tear
  // the shared channel down and rebuild it.
  const subscribe = useCallback((handler: NewMessageHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    // Same guard as ChatScreen's realtime effect: supabase.channel()
    // returns the existing channel object registered under a topic rather
    // than a fresh one, and removeChannel() is async - so a fast re-run
    // (auth state settling, most often) could otherwise hand back an
    // already-subscribed channel and throw on .on().
    void (async () => {
      const stale = supabase
        .getChannels()
        .find((c) => c.topic === `realtime:${TOPIC}`);
      if (stale) await supabase.removeChannel(stale);
      if (cancelled) return;

      channel = supabase
        .channel(TOPIC)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          (payload) => {
            const incoming = payload.new as Message;
            // Snapshot before iterating: a handler is free to unsubscribe
            // (or another one to mount) while this loop is running.
            for (const handler of [...handlersRef.current]) handler(incoming);
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [userId]);

  const value = useMemo<MessageStreamContextValue>(() => ({ subscribe }), [subscribe]);

  return (
    <MessageStreamContext.Provider value={value}>
      {children}
    </MessageStreamContext.Provider>
  );
}

export function useMessageStream(): MessageStreamContextValue {
  return useContext(MessageStreamContext);
}
