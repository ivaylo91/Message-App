// What anyone can read about another user. Email and phone are not
// here: the server refuses them to everyone but their owner (see
// 20261003_hide_contact_details.sql), so they live on OwnProfile.
export interface Profile {
  id: string;
  display_name: string;
  avatar_path: string | null;
  username: string | null;
  // Null while the user hides it - the server clears it rather than the
  // app hiding it (see 20260927_add_privacy_settings.sql).
  last_seen_at: string | null;
  show_read_receipts: boolean;
  show_last_seen: boolean;
}

export interface OwnProfile extends Profile {
  email: string;
  phone: string | null;
}

// What search_profiles() returns - deliberately narrower than Profile.
// Email/phone are never included here: they're only searchable as an
// exact match (see the RPC), and once matched there's no need to hand
// them back to the searcher, who already typed the value.
export interface ProfileSearchResult {
  id: string;
  display_name: string;
  avatar_path: string | null;
  username: string | null;
}

export interface ConversationParticipant {
  id: string;
  conversation_id: string;
  user_id: string;
  role: 'MEMBER' | 'ADMIN';
  last_read_at: string | null;
  hidden_at: string | null;
  // Null = not muted; a future timestamp mutes pushes until it passes.
  // See utils/mute.ts and 20260911_add_conversation_mute.sql.
  muted_until: string | null;
  // Set when this participant pinned the conversation to the top of their
  // own list; null when not pinned.
  pinned_at: string | null;
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

export type CallStatus = 'missed' | 'declined' | 'completed';

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
  call_status: CallStatus | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  reply_to_message_id: string | null;
  reply_to?: ReplyPreview | null;
  // Ids @mentioned in a group message (see utils/mentions.ts). Optional:
  // absent on rows from before the column existed and on local pending
  // copies built without it.
  mentions?: string[];
}

export interface MessageReaction {
  id: string;
  message_id: string;
  conversation_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}
