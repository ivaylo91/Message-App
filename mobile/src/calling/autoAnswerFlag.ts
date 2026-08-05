import AsyncStorage from '@react-native-async-storage/async-storage';

// Bridges the "Answer" action on the incoming-call notification into
// CallContext's actual answer flow. Tapping that action while the app is
// backgrounded/killed only launches the app (see notifee's
// `launchActivity`) - it can't touch CallContext/React state directly,
// since it runs from a separate headless JS instance (or, if the app
// happens to already be foreground, a different render entirely). This
// flag is the only thing that survives across that boundary: the
// notification handler writes "answer whoever calls next", and
// CallContext consumes it the moment a real call-offer actually arrives.
const KEY = 'pendingAutoAnswer';
// Generous headroom past the 45s ring/resend window (see CallContext's
// RING_TIMEOUT_MS) to cover a slow cold start, without leaving a stale
// flag around long enough to auto-answer some unrelated later call from
// the same person.
const MAX_AGE_MS = 2 * 60 * 1000;

interface PendingAutoAnswer {
  callerId: string;
  setAt: number;
}

export async function requestAutoAnswer(callerId: string): Promise<void> {
  const value: PendingAutoAnswer = { callerId, setAt: Date.now() };
  await AsyncStorage.setItem(KEY, JSON.stringify(value));
}

// Reads and clears the flag in one step - called once, right as a
// call-offer arrives, so a stale or already-used flag can never leak
// into a later, unrelated call.
export async function consumeAutoAnswer(callerId: string): Promise<boolean> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return false;
  await AsyncStorage.removeItem(KEY);
  try {
    const value = JSON.parse(raw) as PendingAutoAnswer;
    return value.callerId === callerId && Date.now() - value.setAt < MAX_AGE_MS;
  } catch {
    return false;
  }
}
