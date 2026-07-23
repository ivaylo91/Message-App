export interface User {
  id: string;
  email: string;
  displayName?: string;
}

export interface ConversationParticipant {
  id: string;
  userId: string;
  role: 'MEMBER' | 'ADMIN';
  user: User;
}

export interface Conversation {
  id: string;
  isGroup: boolean;
  name: string | null;
  createdAt: string;
  updatedAt: string;
  participants: ConversationParticipant[];
  messages?: Message[];
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

export interface AuthResponse {
  accessToken: string;
  user: { id: string; email: string };
}
