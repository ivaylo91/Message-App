import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { fetchProfile, updateLastSeen } from '../data/profiles';
import { useAppForeground } from '../hooks/useAppForeground';

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
  // Called by the privacy setting once it has saved, so presence follows
  // it immediately instead of on the next launch.
  setSharesLastSeen: (shares: boolean) => void;
}

const PresenceContext = createContext<PresenceContextValue>({
  isOnline: () => false,
  setSharesLastSeen: () => {},
});

export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  // Whether this user shows as online and keeps last_seen_at fresh - the
  // "last seen" privacy setting. The server already refuses to store
  // last_seen_at while it's off, but online status never touches the
  // database: it exists only because this client announces itself. So
  // the client is what enforces that half, which is sound - only this
  // user's own device can announce them.
  //
  // Null until the profile has loaded, and treated as "don't share":
  // tracking first and correcting a moment later would briefly show
  // someone as online who has asked not to be.
  const [sharesLastSeen, setSharesLastSeen] = useState<boolean | null>(null);

  const loadSetting = useCallback(() => {
    if (!userId) return;
    void fetchProfile(userId)
      .then((profile) => setSharesLastSeen(profile.show_last_seen))
      // Stays at its current value on failure. For a first load that is
      // null - not shared - and the next foreground retries.
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    setSharesLastSeen(null);
    loadSetting();
  }, [loadSetting]);

  // Also covers the setting being changed on another device.
  useAppForeground(loadSetting);

  // The channel lives for the whole session regardless of the setting -
  // hiding your own status doesn't stop you seeing other people's - so
  // the setting is applied through this ref rather than by tearing the
  // channel down and recreating it on the same topic (which is exactly
  // the reuse trap TypingContext.tsx documents).
  const applySharingRef = useRef<(() => void) | null>(null);
  const sharesRef = useRef(sharesLastSeen);
  sharesRef.current = sharesLastSeen;

  useEffect(() => {
    if (!userId) {
      setOnlineIds(new Set());
      return;
    }

    const channel = supabase.channel(PRESENCE_TOPIC, {
      config: { presence: { key: userId }, private: true },
    });
    let isSubscribed = false;

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

    // Brings tracking in line with the setting and the app's state.
    // Idempotent, so it's safe to call on any of the events below.
    const applySharing = () => {
      if (!isSubscribed) return;
      if (sharesRef.current === true && AppState.currentState === 'active') {
        void channel.track({ online: true });
        pingLastSeen();
        startHeartbeat();
      } else {
        void channel.untrack();
        stopHeartbeat();
      }
    };
    applySharingRef.current = applySharing;

    channel
      .on('presence', { event: 'sync' }, syncOnlineIds)
      .on('presence', { event: 'join' }, syncOnlineIds)
      .on('presence', { event: 'leave' }, syncOnlineIds)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          isSubscribed = true;
          applySharing();
        }
      });

    // Untrack while backgrounded so other clients see this device go
    // offline promptly instead of waiting on the connection to time out
    // - and stamp last_seen_at one more time right as that happens, so
    // it reflects this exact moment rather than up to a heartbeat
    // interval's worth of staleness.
    const onAppStateChange = (state: AppStateStatus) => {
      if (state !== 'active' && sharesRef.current === true) pingLastSeen();
      applySharing();
    };
    const subscription = AppState.addEventListener('change', onAppStateChange);

    return () => {
      applySharingRef.current = null;
      subscription.remove();
      stopHeartbeat();
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    applySharingRef.current?.();
  }, [sharesLastSeen]);

  const value = useMemo<PresenceContextValue>(
    () => ({ isOnline: (id: string) => onlineIds.has(id), setSharesLastSeen }),
    [onlineIds],
  );

  return (
    <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>
  );
}

export function usePresence(): PresenceContextValue {
  return useContext(PresenceContext);
}
