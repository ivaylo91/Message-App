import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearChatCaches,
  getCachedChat,
  loadCachedConversations,
  saveCachedConversations,
  setCachedChat,
} from '../src/data/chatCache';
import type { Conversation, Message } from '../src/types';

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      setItem: async (key: string, value: string) => void store.set(key, value),
      getItem: async (key: string) => store.get(key) ?? null,
      getAllKeys: async () => [...store.keys()],
      removeMany: async (keys: string[]) => keys.forEach((key) => store.delete(key)),
    },
  };
});

const SECRET = 'meet me at the old pier';
const FILE_NAME = 'divorce-papers.pdf';

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    conversation_id: 'c1',
    sender_id: 'u2',
    body: SECRET,
    media_path: 'c1/secret-path.jpg',
    attachment_type: null,
    attachment_name: FILE_NAME,
    attachment_mime_type: null,
    attachment_duration_ms: null,
    call_status: null,
    created_at: '2026-10-30T10:00:00Z',
    edited_at: null,
    deleted_at: null,
    reply_to_message_id: null,
    ...overrides,
  };
}

function conversation(messages: Message[]): Conversation {
  return {
    id: 'c1',
    is_group: false,
    name: null,
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-30T10:00:00Z',
    conversation_participants: [],
    messages,
  };
}

describe('the chat list on disk', () => {
  beforeEach(() => clearChatCaches());

  it('never writes message content', async () => {
    await saveCachedConversations('u1', [conversation([message()])]);
    const written = await AsyncStorage.getItem('conversationList:v1:u1');
    expect(written).not.toContain(SECRET);
    expect(written).not.toContain(FILE_NAME);
    expect(written).not.toContain('secret-path');
  });

  it('does not write fields added to messages later', async () => {
    const future = { ...message(), transcript: SECRET } as Message;
    await saveCachedConversations('u1', [conversation([future])]);
    expect(await AsyncStorage.getItem('conversationList:v1:u1')).not.toContain(SECRET);
  });

  it('keeps who, when and what kind of message came last', async () => {
    await saveCachedConversations('u1', [
      conversation([message({ attachment_type: 'image', call_status: 'missed' })]),
    ]);
    const [cached] = (await loadCachedConversations('u1')) ?? [];
    const last = cached.messages?.[0];
    expect(last?.sender_id).toBe('u2');
    expect(last?.created_at).toBe('2026-10-30T10:00:00Z');
    expect(last?.attachment_type).toBe('image');
    expect(last?.call_status).toBe('missed');
  });

  it('keeps each account separate', async () => {
    await saveCachedConversations('u1', [conversation([])]);
    expect(await loadCachedConversations('u2')).toBeNull();
  });

  it('treats a corrupt entry as nothing cached', async () => {
    await AsyncStorage.setItem('conversationList:v1:u1', '{not json');
    expect(await loadCachedConversations('u1')).toBeNull();
  });

  it('is gone after sign-out, and leaves other keys alone', async () => {
    await AsyncStorage.setItem('chatFilter:v1', 'unread');
    await saveCachedConversations('u1', [conversation([])]);
    await clearChatCaches();
    expect(await loadCachedConversations('u1')).toBeNull();
    expect(await AsyncStorage.getItem('chatFilter:v1')).toBe('unread');
  });
});

describe('open chats in memory', () => {
  beforeEach(() => clearChatCaches());

  it('keeps real content, so a reopened chat shows it at once', () => {
    setCachedChat('c1', { messages: [message()], reactions: [] });
    expect(getCachedChat('c1')?.messages[0].body).toBe(SECRET);
  });

  it('drops the least recently opened chat past the limit', () => {
    for (let i = 0; i < 20; i++) setCachedChat(`c${i}`, { messages: [], reactions: [] });
    getCachedChat('c0');
    setCachedChat('c20', { messages: [], reactions: [] });
    expect(getCachedChat('c0')).not.toBeNull();
    expect(getCachedChat('c1')).toBeNull();
  });

  it('is empty after sign-out', async () => {
    setCachedChat('c1', { messages: [message()], reactions: [] });
    await clearChatCaches();
    expect(getCachedChat('c1')).toBeNull();
  });
});
