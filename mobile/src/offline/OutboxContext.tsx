import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../auth/AuthContext';
import * as conversationsData from '../data/conversations';
import { loadOutbox, saveOutbox, OutboxEntry } from './outboxStorage';
import { ReplyPreview } from '../types';

// Row-level security rejections come back from PostgREST as code 42501
// (insufficient_privilege) - distinguishing these from ordinary network
// errors (which have no such code) is what lets flush() give up on a
// single un-sendable message instead of retrying it forever.
function isPermanentSendError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === '42501'
  );
}

interface QueueMessageInput {
  conversationId: string;
  tempId: string;
  body: string;
  replyToMessageId: string | null;
  replyToPreview: ReplyPreview | null;
}

interface OutboxContextValue {
  isOnline: boolean;
  pendingByConversation: Record<string, OutboxEntry[]>;
  queueMessage: (input: QueueMessageInput) => void;
  retry: () => void;
}

const OutboxContext = createContext<OutboxContextValue>({
  isOnline: true,
  pendingByConversation: {},
  queueMessage: () => {},
  retry: () => {},
});

// A message that fails to send (offline, or just a flaky connection)
// stays queued here instead of vanishing with an error Alert - queued
// entries persist to disk so they survive the app being killed, and
// flush automatically the moment connectivity returns. This is global
// (not per-screen) so a send made just before backgrounding the app
// still goes out later even if the user has since navigated away from
// that conversation; ChatScreen only needs to render whatever's
// currently pending for the conversation it has open (see
// pendingByConversation) - the real message it becomes shows up through
// the normal realtime INSERT subscription once it actually sends.
export function OutboxProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const flushingRef = useRef(false);
  const entriesRef = useRef<OutboxEntry[]>([]);
  entriesRef.current = entries;

  useEffect(() => {
    void loadOutbox().then(setEntries);
  }, []);

  useEffect(() => {
    void saveOutbox(entries);
  }, [entries]);

  // Removes an entry from both the ref and the React state that mirrors
  // it, synchronously and in that order. This matters because flush()'s
  // loop re-checks entriesRef.current on its very next iteration with no
  // await in between - entriesRef.current = entries above only runs on
  // this component's *next render*, which React schedules asynchronously
  // and hasn't happened yet at that point. Without updating the ref here
  // directly, the loop would see the just-sent entry still sitting in
  // the stale ref and send it again - which is exactly what was
  // happening: every message got sent twice, about a second apart (the
  // time it took the *second* send's own network round trip to give a
  // render a chance to happen and catch the ref up), confirmed against
  // real duplicate rows in the messages table.
  function removeFromQueue(tempId: string) {
    entriesRef.current = entriesRef.current.filter((e) => e.tempId !== tempId);
    setEntries(entriesRef.current);
  }

  const flush = useCallback(async () => {
    if (flushingRef.current || !userId) return;
    flushingRef.current = true;
    try {
      // Oldest-first, one at a time, so a still-broken connection stops
      // at the first failure and leaves order intact for next time,
      // rather than racing every queued message at once.
      while (entriesRef.current.length > 0) {
        const next = entriesRef.current[0];
        try {
          await conversationsData.sendMessage(
            next.conversationId,
            userId,
            next.body,
            next.replyToMessageId,
          );
          removeFromQueue(next.tempId);
        } catch (err) {
          // A row-level-security rejection (e.g. the recipient has
          // blocked this sender - see the "blocked users cannot message
          // each other" policy) will never succeed no matter how many
          // times it's retried. Unlike a network failure, leaving it at
          // the front of the queue would jam every other pending message
          // - including ones to unrelated conversations - behind it
          // forever, so it's dropped instead and the rest of the queue
          // keeps moving. Silently, rather than surfacing "you've been
          // blocked" as an error: that would out the block to the very
          // person the block is meant to keep from finding out.
          if (isPermanentSendError(err)) {
            removeFromQueue(next.tempId);
            continue;
          }
          break;
        }
      }
    } finally {
      flushingRef.current = false;
    }
  }, [userId]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(online);
      if (online) void flush();
    });
    return () => unsubscribe();
  }, [flush]);

  const queueMessage = useCallback(
    (input: QueueMessageInput) => {
      // Same reasoning as removeFromQueue: flush() is about to read
      // entriesRef.current immediately (no render in between), so the
      // new entry has to be there synchronously rather than waiting on
      // the next render to update the ref - otherwise flush() can start
      // its loop seeing the entry not yet added at all and return
      // without sending anything, leaving the message stuck pending
      // until some unrelated later trigger (e.g. a network state
      // change) calls flush() again.
      entriesRef.current = [...entriesRef.current, { ...input, createdAt: new Date().toISOString() }];
      setEntries(entriesRef.current);
      void flush();
    },
    [flush],
  );

  const pendingByConversation = useMemo(() => {
    const map: Record<string, OutboxEntry[]> = {};
    for (const entry of entries) {
      (map[entry.conversationId] ??= []).push(entry);
    }
    return map;
  }, [entries]);

  const value = useMemo<OutboxContextValue>(
    () => ({
      isOnline,
      pendingByConversation,
      queueMessage,
      retry: () => void flush(),
    }),
    [isOnline, pendingByConversation, queueMessage, flush],
  );

  return <OutboxContext.Provider value={value}>{children}</OutboxContext.Provider>;
}

export function useOutbox(): OutboxContextValue {
  return useContext(OutboxContext);
}