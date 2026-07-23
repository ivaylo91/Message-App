import { apiClient } from './client';
import { Conversation, Message } from '../types';

export function fetchConversations() {
  return apiClient
    .get<Conversation[]>('/conversations')
    .then((res) => res.data);
}

export function fetchConversation(conversationId: string) {
  return apiClient
    .get<Conversation>(`/conversations/${conversationId}`)
    .then((res) => res.data);
}

export function createConversation(participantIds: string[], name?: string) {
  return apiClient
    .post<Conversation>('/conversations', {
      participantIds,
      isGroup: participantIds.length > 1,
      name,
    })
    .then((res) => res.data);
}

export function fetchMessages(conversationId: string) {
  return apiClient
    .get<Message[]>(`/conversations/${conversationId}/messages`)
    .then((res) => res.data);
}

export function sendMessage(conversationId: string, body: string) {
  return apiClient
    .post<Message>(`/conversations/${conversationId}/messages`, { body })
    .then((res) => res.data);
}
