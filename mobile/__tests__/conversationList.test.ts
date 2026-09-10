import { applyIncomingMessage } from '../src/utils/conversationList';
import { Conversation, Message } from '../src/types';

function conversation(id: string, updatedAt: string, preview?: Message): Conversation {
  return {
    id,
    is_group: false,
    name: null,
    created_at: updatedAt,
    updated_at: updatedAt,
    conversation_participants: [],
    messages: preview ? [preview] : [],
  };
}

function message(overrides: Partial<Message> & { conversation_id: string }): Message {
  return {
    id: 'm-default',
    sender_id: 'someone',
    body: 'hello',
    media_path: null,
    attachment_type: null,
    attachment_name: null,
    attachment_mime_type: null,
    attachment_duration_ms: null,
    call_status: null,
    created_at: '2026-09-09T12:00:00.000Z',
    edited_at: null,
    deleted_at: null,
    reply_to_message_id: null,
    ...overrides,
  };
}

test('refreshes the preview and moves the conversation to the top', () => {
  const list = [
    conversation('a', '2026-09-09T11:00:00.000Z'),
    conversation('b', '2026-09-09T10:00:00.000Z'),
    conversation('c', '2026-09-09T09:00:00.000Z'),
  ];
  const incoming = message({ conversation_id: 'c', id: 'm1', body: 'newest' });

  const { conversations, needsRefetch } = applyIncomingMessage(list, incoming);

  expect(needsRefetch).toBe(false);
  expect(conversations.map((c) => c.id)).toEqual(['c', 'a', 'b']);
  expect(conversations[0].messages?.[0].body).toBe('newest');
  expect(conversations[0].updated_at).toBe(incoming.created_at);
});

test('repeated arrivals keep the list in most-recent-first order', () => {
  let list = [
    conversation('a', '2026-09-09T09:00:00.000Z'),
    conversation('b', '2026-09-09T08:00:00.000Z'),
    conversation('c', '2026-09-09T07:00:00.000Z'),
  ];

  list = applyIncomingMessage(
    list,
    message({ conversation_id: 'b', id: 'm1', created_at: '2026-09-09T10:00:00.000Z' }),
  ).conversations;
  list = applyIncomingMessage(
    list,
    message({ conversation_id: 'c', id: 'm2', created_at: '2026-09-09T11:00:00.000Z' }),
  ).conversations;
  list = applyIncomingMessage(
    list,
    message({ conversation_id: 'b', id: 'm3', created_at: '2026-09-09T12:00:00.000Z' }),
  ).conversations;

  expect(list.map((c) => c.id)).toEqual(['b', 'c', 'a']);
});

test('asks for a refetch when the conversation is not in the list', () => {
  const list = [conversation('a', '2026-09-09T11:00:00.000Z')];

  const { conversations, needsRefetch } = applyIncomingMessage(
    list,
    message({ conversation_id: 'unknown', id: 'm1' }),
  );

  expect(needsRefetch).toBe(true);
  expect(conversations).toBe(list);
});

test('ignores a redelivery of the message already shown', () => {
  const preview = message({ conversation_id: 'a', id: 'm1' });
  const list = [
    conversation('b', '2026-09-09T13:00:00.000Z'),
    conversation('a', '2026-09-09T12:00:00.000Z', preview),
  ];

  const { conversations } = applyIncomingMessage(list, preview);

  // Same array identity - no reorder, and nothing for React to re-render.
  expect(conversations).toBe(list);
});

test('an out-of-order older message does not roll the preview back', () => {
  const preview = message({
    conversation_id: 'a',
    id: 'm2',
    body: 'newer',
    created_at: '2026-09-09T12:00:00.000Z',
  });
  const list = [
    conversation('b', '2026-09-09T13:00:00.000Z'),
    conversation('a', '2026-09-09T12:00:00.000Z', preview),
  ];

  const { conversations } = applyIncomingMessage(
    list,
    message({
      conversation_id: 'a',
      id: 'm1',
      body: 'older',
      created_at: '2026-09-09T11:00:00.000Z',
    }),
  );

  expect(conversations).toBe(list);
  expect(conversations[1].messages?.[0].body).toBe('newer');
});

test('fills in the preview for a conversation that had no messages', () => {
  const list = [
    conversation('a', '2026-09-09T11:00:00.000Z'),
    conversation('empty', '2026-09-09T10:00:00.000Z'),
  ];

  const { conversations } = applyIncomingMessage(
    list,
    message({ conversation_id: 'empty', id: 'm1', body: 'first' }),
  );

  expect(conversations.map((c) => c.id)).toEqual(['empty', 'a']);
  expect(conversations[0].messages?.[0].body).toBe('first');
});

test("the user's own message updates the preview too", () => {
  const list = [
    conversation('a', '2026-09-09T11:00:00.000Z'),
    conversation('b', '2026-09-09T10:00:00.000Z'),
  ];

  const { conversations } = applyIncomingMessage(
    list,
    message({ conversation_id: 'b', id: 'm1', sender_id: 'me', body: 'sent by me' }),
  );

  expect(conversations[0].id).toBe('b');
  expect(conversations[0].messages?.[0].body).toBe('sent by me');
});
