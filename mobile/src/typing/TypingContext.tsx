import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';

// Typing indicators are needed in two places at once: ChatScreen (the
// bubble at the bottom of the open conversation) and ConversationsScreen
// (the "Typing..." preview in the list, which stays mounted underneath
// the chat in the navigation stack). Both used to call
// supabase.channel(`messages:<id>`) themselves - the exact same topic
// ChatScreen also puts its postgres_changes listeners on.
//
// That doesn't work, for two compounding reasons:
//
//   1. supabase.channel() hands back the *existing* channel object for a
//      topic rather than creating a second one, so two components asking
//      for the same topic get the same already-subscribed channel - and
//      calling .on() on it throws "cannot add postgres_changes callbacks
//      after subscribe()".
//   2. ChatScreen's guard against (1) removes any stale channel on its
//      topic before subscribing - which, since the list was using that
//      same topic, meant opening a chat silently tore down the list's
//      typing subscription every time. It only ever came back because
//      the list rebuilds its channels on every focus.
//
// So: exactly one owner per topic. This provider is it. Both screens
// declare which conversations they care about via watch() and read the
// result from here, so the underlying channel is created once and shared
// however many components are interested.
//
// The topic is `messages:<conversation_id>:typing` - deliberately still
// under the `messages:` prefix, since the broadcast RLS policy
// (20260812_fix_typing_broadcast_policy_crashing_presence.sql) authorizes
// on split_part(topic, ':', 1) = 'messages' and reads the conversation id
// out of segment 2. The trailing segment keeps it a distinct topic string
// from ChatScreen's postgres_changes channel while staying inside that
// same participants-only policy, so it needs no migration.
const TYPING_INDICATOR_TIMEOUT_MS = 3000;
const TYPING_BROADCAST_THROTTLE_MS = 2000;

function typingTopic(conversationId: string): string {
  return `messages:${conversationId}:typing`;
}

interface TypingContextValue {
  // Conversations where someone *other than this user* is currently
  // typing. Same shape for 1:1 and groups - who is typing isn't tracked,
  // only that somebody is.
  typingConversationIds: Set<string>;
  // Declares interest in these conversations' typing broadcasts for as
  // long as the caller is mounted. Returns the matching unwatch - call it
  // from the effect's cleanup.
  watch: (conversationIds: string[]) => () => void;
  sendTyping: (conversationId: string) => void;
}

const TypingContext = createContext<TypingContextValue>({
  typingConversationIds: new Set(),
  watch: () => () => {},
  sendTyping: () => {},
});

export function TypingProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const [typingConversationIds, setTypingConversationIds] = useState<Set<string>>(
    new Set(),
  );
  // The union of every mounted caller's interest, as a stable sorted
  // array - the reconciling effect below keys off it.
  const [watchedIds, setWatchedIds] = useState<string[]>([]);
  const refCountsRef = useRef<Map<string, number>>(new Map());
  const channelsRef = useRef<Map<string, RealtimeChannel>>(new Map());
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lastSentAtRef = useRef<Map<string, number>>(new Map());
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = userId;

  // Returns the *same* array when the set of watched conversations hasn't
  // actually changed, which is what keeps the reconciling effect from
  // re-running. That matters more than it looks: React runs an effect's
  // cleanup and its next run back to back, so a caller re-watching the
  // same ids (ConversationsScreen does exactly this every time its
  // `conversations` array identity changes) drives each refcount 1 -> 0
  // -> 1 within one commit. Both setState calls are batched, so the
  // transient 0 never reaches the reconciler and the channel is never
  // torn down and immediately recreated - which is the async
  // removeChannel() race this whole provider exists to avoid.
  const syncWatchedIds = useCallback(() => {
    const next = [...refCountsRef.current.keys()].sort();
    setWatchedIds((current) =>
      current.length === next.length && current.every((id, i) => id === next[i])
        ? current
        : next,
    );
  }, []);

  const watch = useCallback(
    (conversationIds: string[]) => {
      for (const id of conversationIds) {
        refCountsRef.current.set(id, (refCountsRef.current.get(id) ?? 0) + 1);
      }
      syncWatchedIds();

      return () => {
        for (const id of conversationIds) {
          const remaining = (refCountsRef.current.get(id) ?? 1) - 1;
          if (remaining > 0) refCountsRef.current.set(id, remaining);
          else refCountsRef.current.delete(id);
        }
        syncWatchedIds();
      };
    },
    [syncWatchedIds],
  );

  const markTyping = useCallback((conversationId: string) => {
    setTypingConversationIds((current) => {
      if (current.has(conversationId)) return current;
      const next = new Set(current);
      next.add(conversationId);
      return next;
    });

    const existing = timeoutsRef.current.get(conversationId);
    if (existing) clearTimeout(existing);
    timeoutsRef.current.set(
      conversationId,
      setTimeout(() => {
        timeoutsRef.current.delete(conversationId);
        setTypingConversationIds((current) => {
          if (!current.has(conversationId)) return current;
          const next = new Set(current);
          next.delete(conversationId);
          return next;
        });
      }, TYPING_INDICATOR_TIMEOUT_MS),
    );
  }, []);

  const clearTyping = useCallback((conversationId: string) => {
    const timeout = timeoutsRef.current.get(conversationId);
    if (timeout) clearTimeout(timeout);
    timeoutsRef.current.delete(conversationId);
    setTypingConversationIds((current) => {
      if (!current.has(conversationId)) return current;
      const next = new Set(current);
      next.delete(conversationId);
      return next;
    });
  }, []);

  // Opens a channel for every watched conversation that doesn't have one
  // yet and closes the ones nobody is watching anymore. Since this
  // provider is the only thing that ever touches these topics, "not in
  // channelsRef" is a reliable answer to "is this topic free" - no
  // stale-channel lookup needed the way the screens used to do.
  useEffect(() => {
    if (!userId) return;

    for (const conversationId of watchedIds) {
      if (channelsRef.current.has(conversationId)) continue;
      const channel = supabase
        .channel(typingTopic(conversationId), { config: { private: true } })
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          if (payload?.userId === userIdRef.current) return;
          markTyping(conversationId);
        })
        .subscribe();
      channelsRef.current.set(conversationId, channel);
    }

    for (const [conversationId, channel] of [...channelsRef.current]) {
      if (watchedIds.includes(conversationId)) continue;
      channelsRef.current.delete(conversationId);
      clearTyping(conversationId);
      void supabase.removeChannel(channel);
    }
  }, [watchedIds, userId, markTyping, clearTyping]);

  // Signing out drops every channel - they're all authorized against the
  // signed-in user, and a token that's no longer valid would just have
  // them fail to rejoin.
  useEffect(() => {
    if (userId) return;
    for (const [conversationId, channel] of [...channelsRef.current]) {
      channelsRef.current.delete(conversationId);
      clearTyping(conversationId);
      void supabase.removeChannel(channel);
    }
  }, [userId, clearTyping]);

  useEffect(() => {
    const timeouts = timeoutsRef.current;
    const channels = channelsRef.current;
    return () => {
      for (const timeout of timeouts.values()) clearTimeout(timeout);
      timeouts.clear();
      for (const channel of channels.values()) void supabase.removeChannel(channel);
      channels.clear();
    };
  }, []);

  // Throttled here rather than at the call site so there's one rule for
  // it, and so it can't be defeated by a screen remounting mid-typing.
  const sendTyping = useCallback((conversationId: string) => {
    const channel = channelsRef.current.get(conversationId);
    if (!channel) return;
    const now = Date.now();
    if (now - (lastSentAtRef.current.get(conversationId) ?? 0) <= TYPING_BROADCAST_THROTTLE_MS) {
      return;
    }
    lastSentAtRef.current.set(conversationId, now);
    void channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: userIdRef.current },
    });
  }, []);

  const value = useMemo<TypingContextValue>(
    () => ({ typingConversationIds, watch, sendTyping }),
    [typingConversationIds, watch, sendTyping],
  );

  return <TypingContext.Provider value={value}>{children}</TypingContext.Provider>;
}

export function useTyping(): TypingContextValue {
  return useContext(TypingContext);
}
