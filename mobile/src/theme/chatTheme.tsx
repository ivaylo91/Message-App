import { createContext, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from './ThemeContext';
import { BUBBLE_GRADIENT_PRESETS, type BubbleGradientPair } from './tokens';

// A colour for one conversation, overriding the bubble colour chosen in
// Profile - so the family chat and the work chat can look different.
//
// Kept on this device, like the global bubble colour: it's how *you* see
// the chat, not something the other people in it see or should be told
// about. Stored per conversation as a preset id (BUBBLE_GRADIENT_PRESETS).

const KEY_PREFIX = 'chatTheme:v1:';

export async function loadChatTheme(conversationId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY_PREFIX + conversationId);
  } catch {
    return null;
  }
}

// null goes back to the app-wide colour.
export async function saveChatTheme(conversationId: string, presetId: string | null): Promise<void> {
  try {
    if (presetId) await AsyncStorage.setItem(KEY_PREFIX + conversationId, presetId);
    else await AsyncStorage.removeItem(KEY_PREFIX + conversationId);
  } catch {
    // A colour that doesn't stick is not worth an error.
  }
}

// The conversation's preset id, or null for the app-wide colour.
const ChatGradientsContext = createContext<string | null>(null);

// Provided by ChatScreen around a conversation that has its own colour.
export const ChatGradientsProvider = ChatGradientsContext.Provider;

// The bubble colours to draw with: the conversation's own, when it has
// one, otherwise the app-wide choice.
export function useBubbleGradients(): BubbleGradientPair {
  const presetId = useContext(ChatGradientsContext);
  const { gradients, scheme } = useTheme();
  const preset = presetId ? BUBBLE_GRADIENT_PRESETS.find((p) => p.id === presetId) : undefined;
  return preset ? preset[scheme] : gradients;
}
