/**
 * Guards the invariant the typing rewrite depends on: exactly one
 * realtime channel per conversation topic, no matter how many mounted
 * screens are interested, and no teardown/recreate churn when a watcher
 * re-declares the same interest (which ConversationsScreen does on every
 * focus, since its `conversations` array is a fresh identity each load).
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { TypingProvider, useTyping } from '../src/typing/TypingContext';

const mockChannels = new Map<string, any>();
const mockChannelCalls: string[] = [];
const mockRemoved: string[] = [];

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    channel: (topic: string) => {
      mockChannelCalls.push(topic);
      const channel: any = {
        topic,
        handlers: [] as any[],
        on: (_type: string, _filter: unknown, handler: (m: any) => void) => {
          channel.handlers.push(handler);
          return channel;
        },
        subscribe: () => channel,
        send: jest.fn(),
      };
      mockChannels.set(topic, channel);
      return channel;
    },
    removeChannel: (channel: any) => {
      mockRemoved.push(channel.topic);
      return Promise.resolve('ok');
    },
  },
}));

jest.mock('../src/auth/AuthContext', () => ({
  useAuth: () => ({ userId: 'me' }),
}));

function Watcher({ ids }: { ids: string[] }) {
  const { watch } = useTyping();
  React.useEffect(() => watch(ids), [watch, ids]);
  return null;
}

let observed: Set<string> = new Set();

function Observer() {
  const { typingConversationIds } = useTyping();
  observed = typingConversationIds;
  return null;
}

// The indicator's own 3s expiry would otherwise fire after a test has
// finished, updating state outside act().
jest.useFakeTimers();

beforeEach(() => {
  mockChannels.clear();
  mockChannelCalls.length = 0;
  mockRemoved.length = 0;
  observed = new Set();
});

test('two watchers of one conversation share a single channel', () => {
  act(() => {
    create(
      <TypingProvider>
        <Watcher ids={['conv-a']} />
        <Watcher ids={['conv-a']} />
      </TypingProvider>,
    );
  });

  expect(mockChannelCalls).toEqual(['messages:conv-a:typing']);
  expect(mockRemoved).toEqual([]);
});

test('the topic stays under the participants-only messages: policy prefix', () => {
  act(() => {
    create(
      <TypingProvider>
        <Watcher ids={['conv-a']} />
      </TypingProvider>,
    );
  });

  const [topic] = mockChannelCalls;
  // The broadcast RLS policy authorizes on segment 1 being 'messages'
  // and reads the conversation id out of segment 2.
  expect(topic.split(':')[0]).toBe('messages');
  expect(topic.split(':')[1]).toBe('conv-a');
});

test('re-watching the same ids does not tear the channel down', () => {
  let tree: any;
  act(() => {
    tree = create(
      <TypingProvider>
        <Watcher ids={['conv-a', 'conv-b']} />
      </TypingProvider>,
    );
  });
  expect(mockChannelCalls).toHaveLength(2);

  // A fresh array with identical contents - exactly what a focus reload
  // of the conversation list produces.
  act(() => {
    tree.update(
      <TypingProvider>
        <Watcher ids={['conv-a', 'conv-b']} />
      </TypingProvider>,
    );
  });

  expect(mockChannelCalls).toHaveLength(2);
  expect(mockRemoved).toEqual([]);
});

test('a channel is dropped only once nobody is watching it', () => {
  let tree: any;
  act(() => {
    tree = create(
      <TypingProvider>
        <Watcher ids={['conv-a']} />
        <Watcher ids={['conv-a']} />
      </TypingProvider>,
    );
  });

  act(() => {
    tree.update(
      <TypingProvider>
        <Watcher ids={['conv-a']} />
      </TypingProvider>,
    );
  });
  expect(mockRemoved).toEqual([]);

  act(() => {
    tree.update(<TypingProvider>{null}</TypingProvider>);
  });
  expect(mockRemoved).toEqual(['messages:conv-a:typing']);
});

test('broadcasts from other users mark the conversation, own ones do not', () => {
  act(() => {
    create(
      <TypingProvider>
        <Watcher ids={['conv-a']} />
        <Observer />
      </TypingProvider>,
    );
  });

  const channel = mockChannels.get('messages:conv-a:typing');

  act(() => {
    channel.handlers.forEach((h: any) => h({ payload: { userId: 'me' } }));
  });
  expect(observed.has('conv-a')).toBe(false);

  act(() => {
    channel.handlers.forEach((h: any) => h({ payload: { userId: 'someone-else' } }));
  });
  expect(observed.has('conv-a')).toBe(true);
});
