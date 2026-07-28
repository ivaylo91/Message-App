import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import * as conversationsData from '../data/conversations';
import * as reactionsData from '../data/reactions';
import { Message, MessageReaction } from '../types';

type Props = NativeStackScreenProps<AppStackParamList, 'Chat'>;

const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

interface ReactionSummary {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

function summarizeReactions(
  reactions: MessageReaction[],
  userId: string | null,
): ReactionSummary[] {
  const byEmoji = new Map<string, ReactionSummary>();
  for (const reaction of reactions) {
    const existing = byEmoji.get(reaction.emoji);
    if (existing) {
      existing.count += 1;
      existing.reactedByMe ||= reaction.user_id === userId;
    } else {
      byEmoji.set(reaction.emoji, {
        emoji: reaction.emoji,
        count: 1,
        reactedByMe: reaction.user_id === userId,
      });
    }
  }
  return Array.from(byEmoji.values());
}

interface MessageBubbleProps {
  message: Message;
  isMine: boolean;
  reactions: MessageReaction[];
  userId: string | null;
  isPickerOpen: boolean;
  onLongPress: () => void;
  onToggleReaction: (emoji: string) => void;
}

function MessageBubble({
  message,
  isMine,
  reactions,
  userId,
  isPickerOpen,
  onLongPress,
  onToggleReaction,
}: MessageBubbleProps) {
  const summary = useMemo(
    () => summarizeReactions(reactions, userId),
    [reactions, userId],
  );

  return (
    <View style={isMine ? styles.rowMine : styles.rowTheirs}>
      <TouchableOpacity
        style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}
        onLongPress={onLongPress}
        activeOpacity={0.8}
      >
        <Text>{message.body}</Text>
      </TouchableOpacity>

      {summary.length > 0 && (
        <View style={styles.reactionRow}>
          {summary.map((r) => (
            <TouchableOpacity
              key={r.emoji}
              style={[styles.reactionPill, r.reactedByMe && styles.reactionPillMine]}
              onPress={() => onToggleReaction(r.emoji)}
            >
              <Text style={styles.reactionPillText}>
                {r.emoji} {r.count > 1 ? r.count : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {isPickerOpen && (
        <View style={styles.picker}>
          {QUICK_REACTIONS.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              onPress={() => onToggleReaction(emoji)}
              style={styles.pickerEmoji}
            >
              <Text style={styles.pickerEmojiText}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

export function ChatScreen({ route, navigation }: Props) {
  const { conversationId, title } = route.params;
  const { userId } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<MessageReaction[]>([]);
  const [draft, setDraft] = useState('');
  const [pickerMessageId, setPickerMessageId] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);

  const upsertMessage = useCallback((incoming: Message) => {
    setMessages((current) => {
      if (current.some((m) => m.id === incoming.id)) return current;
      return [incoming, ...current];
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void conversationsData
        .fetchMessages(conversationId)
        .then((fetched) => setMessages(fetched));
      void reactionsData
        .fetchReactions(conversationId)
        .then((fetched) => setReactions(fetched));
    }, [conversationId]),
  );

  useEffect(() => {
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => upsertMessage(payload.new as Message),
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_reactions',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const incoming = payload.new as MessageReaction;
          setReactions((current) =>
            current.some((r) => r.id === incoming.id)
              ? current
              : [...current, incoming],
          );
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'message_reactions',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const removed = payload.old as MessageReaction;
          setReactions((current) => current.filter((r) => r.id !== removed.id));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, upsertMessage]);

  const onSend = async () => {
    const body = draft.trim();
    if (!body || !userId) return;
    setDraft('');
    const message = await conversationsData.sendMessage(
      conversationId,
      userId,
      body,
    );
    upsertMessage(message);
  };

  const onToggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!userId) return;
      setPickerMessageId(null);
      const alreadyReacted = reactions.some(
        (r) => r.message_id === messageId && r.user_id === userId && r.emoji === emoji,
      );
      if (alreadyReacted) {
        await reactionsData.removeReaction(messageId, userId, emoji);
        setReactions((current) =>
          current.filter(
            (r) =>
              !(r.message_id === messageId && r.user_id === userId && r.emoji === emoji),
          ),
        );
      } else {
        const reaction = await reactionsData.addReaction(
          messageId,
          conversationId,
          userId,
          emoji,
        );
        setReactions((current) => [...current, reaction]);
      }
    },
    [conversationId, reactions, userId],
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <FlatList
        style={styles.list}
        data={messages}
        keyExtractor={(item) => item.id}
        inverted
        renderItem={({ item }) => (
          <MessageBubble
            message={item}
            isMine={item.sender_id === userId}
            reactions={reactions.filter((r) => r.message_id === item.id)}
            userId={userId}
            isPickerOpen={pickerMessageId === item.id}
            onLongPress={() =>
              setPickerMessageId((current) =>
                current === item.id ? null : item.id,
              )
            }
            onToggleReaction={(emoji) => void onToggleReaction(item.id, emoji)}
          />
        )}
      />
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder="Message"
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => void onSend()}
        />
        <TouchableOpacity onPress={() => void onSend()} style={styles.sendButton}>
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { flex: 1, paddingHorizontal: 12 },
  rowMine: { alignItems: 'flex-end', marginVertical: 4 },
  rowTheirs: { alignItems: 'flex-start', marginVertical: 4 },
  bubble: {
    padding: 10,
    borderRadius: 12,
    maxWidth: '80%',
  },
  bubbleMine: { backgroundColor: '#DCF8C6' },
  bubbleTheirs: { backgroundColor: '#F0F0F0' },
  reactionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    gap: 4,
  },
  reactionPill: {
    flexDirection: 'row',
    backgroundColor: '#EFEFEF',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  reactionPillMine: { borderColor: '#007AFF' },
  reactionPillText: { fontSize: 13 },
  picker: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginTop: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  pickerEmoji: { paddingHorizontal: 6 },
  pickerEmojiText: { fontSize: 22 },
  composer: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 8,
  },
  sendButton: { paddingHorizontal: 12, paddingVertical: 8 },
  sendText: { color: '#007AFF', fontWeight: '600' },
});
