import AsyncStorage from '@react-native-async-storage/async-storage';

// An unsent message is the only copy of something the user actually
// wrote, and until now leaving the chat threw it away. Kept per
// conversation and on disk (not just in memory) so it also survives the
// app being killed - the same reasoning as the outbox, for the step
// before a message is even sent.
//
// AsyncStorage rather than the keychain: a draft is ordinary content,
// not a credential, and it sits alongside the other non-sensitive
// per-device state (outbox, signed-URL cache, theme choice).
const KEY_PREFIX = 'draft:v1:';

function keyFor(conversationId: string): string {
  return `${KEY_PREFIX}${conversationId}`;
}

export async function loadDraft(conversationId: string): Promise<string> {
  try {
    return (await AsyncStorage.getItem(keyFor(conversationId))) ?? '';
  } catch {
    // A missing draft is not worth failing a screen over.
    return '';
  }
}

export async function saveDraft(conversationId: string, body: string): Promise<void> {
  try {
    // Storing an empty string would leave a key per conversation the
    // user has ever opened, so an emptied draft removes itself instead.
    if (body.length === 0) await AsyncStorage.removeItem(keyFor(conversationId));
    else await AsyncStorage.setItem(keyFor(conversationId), body);
  } catch {
    // Best-effort - losing a draft is bad, but not worth an error state.
  }
}

export async function clearDraft(conversationId: string): Promise<void> {
  await saveDraft(conversationId, '');
}
