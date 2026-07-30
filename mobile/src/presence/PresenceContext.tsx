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

// A single shared Realtime Presence topic every authenticated client
// tracks itself into (see 20260802_add_presence_authorization.sql).
// Unlike per-conversation typing broadcasts, online status isn't scoped
// to a conversation - anyone can see anyone else's presence.
const PRESENCE_TOPIC = 'online-users';

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

    channel
      .on('presence', { event: 'sync' }, syncOnlineIds)
      .on('presence', { event: 'join' }, syncOnlineIds)
      .on('presence', { event: 'leave' }, syncOnlineIds)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void channel.track({ online: true });
      });

    // Untrack while backgrounded so other clients see this device go
    // offline promptly instead of waiting on the connection to time out.
    const onAppStateChange = (state: AppStateStatus) => {
      if (state === 'active') void channel.track({ online: true });
      else void channel.untrack();
    };
    const subscription = AppState.addEventListener('change', onAppStateChange);

    return () => {
      subscription.remove();
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
