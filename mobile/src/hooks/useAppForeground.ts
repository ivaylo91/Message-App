import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

// Runs `onForeground` each time the app comes back from the background.
//
// Screens refetch with useFocusEffect, which fires on *navigation* focus.
// Backgrounding the app is not a navigation event, so a screen that is
// already focused stays focused the whole time the app is away and its
// refetch never runs on return. Realtime does not cover the gap either:
// postgres_changes delivers what happens while the socket is up and
// replays nothing after a reconnect, so every message that lands while
// the app is away is simply missed. The result was a conversation list
// still showing the previous message, with no unread badge, until the
// user pulled to refresh - most visible on a muted conversation, where
// there is no notification to tap through instead.
//
// Only the transition into 'active' counts. Android also emits
// 'inactive' in passing, and on some devices 'active' arrives more than
// once for a single resume, so the previous state is tracked rather than
// keyed off the incoming value alone.
export function useAppForeground(onForeground: () => void) {
  // Held in a ref so the listener is attached once for the lifetime of
  // the component: callers pass an inline closure over changing state,
  // and re-subscribing on every render would drop events.
  const callbackRef = useRef(onForeground);
  callbackRef.current = onForeground;

  useEffect(() => {
    let previous: AppStateStatus = AppState.currentState;

    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active' && previous !== 'active') {
        callbackRef.current();
      }
      previous = next;
    });

    return () => subscription.remove();
  }, []);
}
