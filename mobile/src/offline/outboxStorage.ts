import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReplyPreview } from '../types';

export interface OutboxEntry {
  tempId: string;
  conversationId: string;
  body: string;
  replyToMessageId: string | null;
  replyToPreview: ReplyPreview | null;
  createdAt: string;
}

const STORAGE_KEY = 'outbox:v1';

export async function loadOutbox(): Promise<OutboxEntry[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as OutboxEntry[];
  } catch {
    return [];
  }
}

export async function saveOutbox(entries: OutboxEntry[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}