export interface Profile {
  id: string;
  email: string;
  display_name: string;
  avatar_path: string | null;
}

export interface ConversationParticipant {
  id: string;
  conversation_id: string;
  user_id: string;
  role: 'MEMBER' | 'ADMIN';
  last_read_at: string | null;
  profiles: Profile;
}

export interface Conversation {
  id: string;
  is_group: boolean;
  name: string | null;
  created_at: string;
  updated_at: string;
  conversation_participants: ConversationParticipant[];
  messages?: Message[];
}

export type AttachmentType = 'image' | 'audio' | 'file';

export interface ReplyPreview {
  id: string;
  body: string | null;
  media_path: string | null;
  attachment_type: AttachmentType | null;
  attachment_name: string | null;
  sender_id: string;
  deleted_at: string | null;
  profiles: Profile;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  media_path: string | null;
  attachment_type: AttachmentType | null;
  attachment_name: string | null;
  attachment_mime_type: string | null;
  attachment_duration_ms: number | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  reply_to_message_id: string | null;
  reply_to?: ReplyPreview | null;
}

export interface MessageReaction {
  id: string;
  message_id: string;
  conversation_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}
