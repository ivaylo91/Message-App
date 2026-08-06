import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import { supabase } from '../lib/supabase';

const MESSAGE_PAGE_SIZE = 500;

interface ExportParticipant {
  user_id: string;
  role: string;
  display_name: string;
  username: string | null;
}

interface ExportConversation {
  id: string;
  is_group: boolean;
  name: string | null;
  created_at: string;
  participants: ExportParticipant[];
  messages: ExportMessage[];
}

interface ExportMessage {
  id: string;
  sender_id: string;
  body: string | null;
  attachment_type: string | null;
  attachment_name: string | null;
  call_status: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

// Pages through every message in a conversation (fetchMessages/ChatScreen
// only keep the ~50 most recent loaded) - an export needs the whole
// history, not just what the UI normally renders.
async function fetchAllMessages(conversationId: string): Promise<ExportMessage[]> {
  const all: ExportMessage[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('messages')
      .select(
        'id, sender_id, body, attachment_type, attachment_name, call_status, created_at, edited_at, deleted_at',
      )
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .range(from, from + MESSAGE_PAGE_SIZE - 1);

    if (error) throw error;
    all.push(...(data as ExportMessage[]));
    if (data.length < MESSAGE_PAGE_SIZE) break;
    from += MESSAGE_PAGE_SIZE;
  }
  return all;
}

// Builds a full export of everything RLS lets this user read about
// themselves - their profile plus every conversation they're (or were)
// a participant of, full message history included, not just the ~50
// most recent messages the app normally keeps loaded. Hidden
// conversations (see hideConversation()) are included too, since this
// is "all my data", not "my current chat list".
async function buildExportPayload(userId: string) {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, display_name, username, phone')
    .eq('id', userId)
    .single();
  if (profileError) throw profileError;

  const { data: participantRows, error: participantError } = await supabase
    .from('conversation_participants')
    .select('conversation_id, conversations(id, is_group, name, created_at)')
    .eq('user_id', userId);
  if (participantError) throw participantError;

  const conversations: ExportConversation[] = [];
  for (const row of participantRows as unknown as {
    conversation_id: string;
    conversations: { id: string; is_group: boolean; name: string | null; created_at: string };
  }[]) {
    const conversationId = row.conversation_id;

    const { data: participantData, error: allParticipantsError } = await supabase
      .from('conversation_participants')
      .select('user_id, role, profiles(display_name, username)')
      .eq('conversation_id', conversationId);
    if (allParticipantsError) throw allParticipantsError;

    const participants = (
      participantData as unknown as {
        user_id: string;
        role: string;
        profiles: { display_name: string; username: string | null };
      }[]
    ).map((p) => ({
      user_id: p.user_id,
      role: p.role,
      display_name: p.profiles.display_name,
      username: p.profiles.username,
    }));

    const messages = await fetchAllMessages(conversationId);

    conversations.push({
      id: row.conversations.id,
      is_group: row.conversations.is_group,
      name: row.conversations.name,
      created_at: row.conversations.created_at,
      participants,
      messages,
    });
  }

  return {
    exportedAt: new Date().toISOString(),
    profile,
    conversations,
  };
}

// Writes the export to a temp JSON file and hands it to the native share
// sheet so the user can save it, AirDrop it, email it, etc. - the file
// itself lives in the OS cache dir, which is fine since it's just handed
// off immediately and isn't relied on to persist.
export async function exportAccountData(userId: string): Promise<void> {
  const payload = await buildExportPayload(userId);
  const path = `${RNFS.CachesDirectoryPath}/hearth-data-export-${Date.now()}.json`;
  await RNFS.writeFile(path, JSON.stringify(payload, null, 2), 'utf8');

  await Share.open({
    url: `file://${path}`,
    type: 'application/json',
    filename: 'hearth-data-export',
    failOnCancel: false,
  });
}
