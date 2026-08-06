import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { updateLastSeen } from '../data/profiles';

// A single shared Realtime Presence topic every authenticated client
// tracks itself into (see 20260802_add_presence_authorization.sql).
// Unlike per-conversation typing broadcasts, online status isn't scoped
// to a conversation - anyone can see anyone else's presence.
const PRESENCE_TOPIC = 'online-users';

// Presence itself (channel.track/untrack below) is purely ephemeral -
// once someone drops off the channel there's no record of *when* they
// were last on it. This heartbeat is what backs "Offline · last seen
// Xm ago" for other people once this user goes offline - stamped on
// connect, kept fresh on this interval while active, and stamped once
// more on backgrounding so it reflects the actual moment rather than
// however stale the last heartbeat happened to be.
const LAST_SEEN_HEARTBEAT_MS = 60_000;

interface PresenceContextValue {
  isOnline: (userId: string) => boolean;
}

const PresenceContext = createContext<PresenceContextValue>({
  isOnline: () => false,
});

export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) {
      setOnlineIds(new Set());
      return;
    }

    const channel = supabase.channel(PRESENCE_TOPIC, {
      config: { presence: { key: userId }, private: true },
    });

    const syncOnlineIds = () => {
      setOnlineIds(new Set(Object.keys(channel.presenceState())));
    };

    const pingLastSeen = () => {
      void updateLastSeen(userId).catch(() => {});
    };

    let heartbeat: ReturnType<typeof setInterval> | null = null;
    const startHeartbeat = () => {
      if (heartbeat) return;
      heartbeat = setInterval(pingLastSeen, LAST_SEEN_HEARTBEAT_MS);
    };
    const stopHeartbeat = () => {
      if (!heartbeat) return;
      clearInterval(heartbeat);
      heartbeat = null;
    };

    channel
      .on('presence', { event: 'sync' }, syncOnlineIds)
      .on('presence', { event: 'join' }, syncOnlineIds)
      .on('presence', { event: 'leave' }, syncOnlineIds)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void channel.track({ online: true });
          pingLastSeen();
          startHeartbeat();
        }
      });

    // Untrack while backgrounded so other clients see this device go
    // offline promptly instead of waiting on the connection to time out
    // - and stamp last_seen_at one more time right as that happens, so
    // it reflects this exact moment rather than up to a heartbeat
    // interval's worth of staleness.
    const onAppStateChange = (state: AppStateStatus) => {
      if (state === 'active') {
        void channel.track({ online: true });
        pingLastSeen();
        startHeartbeat();
      } else {
        void channel.untrack();
        pingLastSeen();
        stopHeartbeat();
      }
    };
    const subscription = AppState.addEventListener('change', onAppStateChange);

    return () => {
      subscription.remove();
      stopHeartbeat();
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const value = useMemo<PresenceContextValue>(
    () => ({ isOnline: (id: string) => onlineIds.has(id) }),
    [onlineIds],
  );

  return (
    <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>
  );
}

export function usePresence(): PresenceContextValue {
  return useContext(PresenceContext);
}
