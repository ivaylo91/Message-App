import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearSignedUrlCache } from '../lib/signedUrlCache';
import { Conversation, Message, MessageReaction } from '../types';

// What makes the app open on content instead of placeholders, in two tiers
// split by what they're allowed to hold.
//
// The chat list goes on disk, so it's there on a cold start - but AsyncStorage
// is plaintext, and message content is exactly what the app keeps out of it
// (the session lives in the keychain for the same reason). So only the shape
// of the list is written: who, when, and what kind of message came last. The
// text fills in when the fetch lands, a moment later.
//
// Open chats are held in memory only, which is what lets them keep their real
// content. Reopening a chat is instant; the first open after a launch still
// waits for the network.

const LIST_KEY_PREFIX = 'conversationList:v1:';
// Unsent text, in the plaintext store. See draftStorage.ts.
const DRAFT_KEY_PREFIX = 'draft:v1:';
const MAX_CACHED_CONVERSATIONS = 50;
const MAX_CACHED_CHATS = 20;

function listKey(userId: string): string {
  return `${LIST_KEY_PREFIX}${userId}`;
}

// Built field by field rather than by removing the sensitive ones, so a column
// added to the query later stays off the disk until someone decides otherwise.
function withoutContent(message: Message, conversationId: string): Message {
  return {
    id: message.id,
    conversation_id: conversationId,
    sender_id: message.sender_id,
    created_at: message.created_at,
    attachment_type: message.attachment_type,
    attachment_mime_type: message.attachment_mime_type,
    attachment_duration_ms: message.attachment_duration_ms,
    call_status: message.call_status,
    body: null,
    media_path: null,
    attachment_name: null,
    edited_at: null,
    deleted_at: null,
    reply_to_message_id: null,
  };
}

export async function saveCachedConversations(
  userId: string,
  conversations: Conversation[],
): Promise<void> {
  const safe = conversations.slice(0, MAX_CACHED_CONVERSATIONS).map((conversation) => ({
    ...conversation,
    messages: conversation.messages?.map((m) => withoutContent(m, conversation.id)),
  }));
  await AsyncStorage.setItem(listKey(userId), JSON.stringify(safe));
}

export async function loadCachedConversations(userId: string): Promise<Conversation[] | null> {
  try {
    const stored = await AsyncStorage.getItem(listKey(userId));
    return stored ? (JSON.parse(stored) as Conversation[]) : null;
  } catch {
    // Corrupt or unreadable: the fetch that's already running will do.
    return null;
  }
}

export interface CachedChat {
  messages: Message[];
  reactions: MessageReaction[];
}

// A Map keeps insertion order, so the first key is the least recently used.
const chats = new Map<string, CachedChat>();

export function getCachedChat(conversationId: string): CachedChat | null {
  const chat = chats.get(conversationId);
  if (!chat) return null;
  chats.delete(conversationId);
  chats.set(conversationId, chat);
  return chat;
}

export function setCachedChat(conversationId: string, chat: CachedChat): void {
  chats.delete(conversationId);
  chats.set(conversationId, chat);
  if (chats.size > MAX_CACHED_CHATS) {
    const oldest = chats.keys().next().value;
    if (oldest !== undefined) chats.delete(oldest);
  }
}

// On sign-out, whatever the cause, so nothing of one account outlives it.
export async function clearChatCaches(): Promise<void> {
  chats.clear();
  const keys = await AsyncStorage.getAllKeys();
  await AsyncStorage.removeMany(
    keys.filter((key) => key.startsWith(LIST_KEY_PREFIX) || key.startsWith(DRAFT_KEY_PREFIX)),
  );
  await clearSignedUrlCache();
}
