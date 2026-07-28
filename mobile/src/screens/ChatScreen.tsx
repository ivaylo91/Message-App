import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { AppStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import * as conversationsData from '../data/conversations';
import * as reactionsData from '../data/reactions';
import * as mediaData from '../data/media';
import { ConversationParticipant, Message, MessageReaction } from '../types';

type Props = NativeStackScreenProps<AppStackParamList, 'Chat'>;

const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];
const TYPING_BROADCAST_THROTTLE_MS = 2000;
const TYPING_INDICATOR_TIMEOUT_MS = 3000;

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

function MediaImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void mediaData.getMediaSignedUrl(path).then((signedUrl) => {
      if (!cancelled) setUrl(signedUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!url) {
    return (
      <View style={[styles.media, styles.mediaLoading]}>
        <ActivityIndicator />
      </View>
    );
  }

  return <Image source={{ uri: url }} style={styles.media} resizeMode="cover" />;
}

interface MessageBubbleProps {
  message: Message;
  isMine: boolean;
  reactions: MessageReaction[];
  userId: string | null;
  isPickerOpen: boolean;
  showSeen: boolean;
  onLongPress: () => void;
  onToggleReaction: (emoji: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}

function MessageBubble({
  message,
  isMine,
  reactions,
  userId,
  isPickerOpen,
  showSeen,
  onLongPress,
  onToggleReaction,
  onEdit,
  onDelete,
}: MessageBubbleProps) {
  const { t } = useTranslation();
  const summary = useMemo(
    () => summarizeReactions(reactions, userId),
    [reactions, userId],
  );

  return (
    <View style={isMine ? styles.rowMine : styles.rowTheirs}>
      <TouchableOpacity
        style={[
          message.media_path ? styles.mediaBubble : styles.bubble,
          isMine ? styles.bubbleMine : styles.bubbleTheirs,
        ]}
        onLongPress={onLongPress}
        activeOpacity={0.8}
      >
        {message.media_path && <MediaImage path={message.media_path} />}
        {message.body && <Text>{message.body}</Text>}
        {message.edited_at && <Text style={styles.editedTag}>{t('chat.edited')}</Text>}
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
          {isMine && message.body && (
            <TouchableOpacity onPress={onEdit} style={styles.pickerEmoji}>
              <Text style={styles.pickerActionText}>{t('chat.edit')}</Text>
            </TouchableOpacity>
          )}
          {isMine && (
            <TouchableOpacity onPress={onDelete} style={styles.pickerEmoji}>
              <Text style={[styles.pickerActionText, styles.pickerDeleteText]}>
                {t('chat.delete')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {showSeen && <Text style={styles.seenText}>{t('chat.seen')}</Text>}
    </View>
  );
}

export function ChatScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { conversationId, title } = route.params;
  const { userId } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<MessageReaction[]>([]);
  const [participants, setParticipants] = useState<ConversationParticipant[]>(
    [],
  );
  const [draft, setDraft] = useState('');
  const [pickerMessageId, setPickerMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(
    null,
  );
  const [otherTyping, setOtherTyping] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentAtRef = useRef(0);

  useEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);

  useEffect(() => {
    void conversationsData
      .fetchConversation(conversationId)
      .then((conversation) =>
        setParticipants(conversation.conversation_participants),
      );
  }, [conversationId]);

  const markRead = useCallback(() => {
    if (!userId) return;
    conversationsData.markConversationRead(conversationId, userId).catch(() => {
      // best-effort - a missed read receipt isn't worth surfacing an error for
    });
  }, [conversationId, userId]);

  const upsertMessage = useCallback(
    (incoming: Message) => {
      setMessages((current) => {
        if (current.some((m) => m.id === incoming.id)) return current;
        return [incoming, ...current];
      });
      markRead();
    },
    [markRead],
  );

  useFocusEffect(
    useCallback(() => {
      void conversationsData
        .fetchMessages(conversationId)
        .then((fetched) => setMessages(fetched));
      void reactionsData
        .fetchReactions(conversationId)
        .then((fetched) => setReactions(fetched));
      markRead();
    }, [conversationId, markRead]),
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
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as Message;
          if (updated.deleted_at) {
            setMessages((current) =>
              current.filter((m) => m.id !== updated.id),
            );
          } else {
            setMessages((current) =>
              current.map((m) => (m.id === updated.id ? updated : m)),
            );
          }
        },
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
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversation_participants',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as ConversationParticipant;
          setParticipants((current) =>
            current.map((p) =>
              p.id === updated.id ? { ...p, ...updated } : p,
            ),
          );
        },
      )
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.userId === userId) return;
        setOtherTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(
          () => setOtherTyping(false),
          TYPING_INDICATOR_TIMEOUT_MS,
        );
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [conversationId, upsertMessage, userId]);

  const onChangeDraft = (text: string) => {
    setDraft(text);
    const now = Date.now();
    if (now - lastTypingSentAtRef.current > TYPING_BROADCAST_THROTTLE_MS) {
      lastTypingSentAtRef.current = now;
      void channelRef.current?.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId },
      });
    }
  };

  const onSend = async () => {
    const body = draft.trim();
    if (!body || !userId) return;
    setDraft('');

    if (editingMessageId) {
      const messageId = editingMessageId;
      setEditingMessageId(null);
      const updated = await conversationsData.editMessage(messageId, body);
      setMessages((current) =>
        current.map((m) => (m.id === updated.id ? updated : m)),
      );
      return;
    }

    const message = await conversationsData.sendMessage(
      conversationId,
      userId,
      body,
    );
    upsertMessage(message);
  };

  const onPickImage = async () => {
    if (!userId) return;
    const result = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.7,
    });
    const asset = result.assets?.[0];
    if (!asset?.uri) return;

    setIsUploadingMedia(true);
    try {
      const path = await mediaData.uploadMedia(
        conversationId,
        asset.uri,
        asset.type ?? 'image/jpeg',
      );
      const message = await conversationsData.sendMediaMessage(
        conversationId,
        userId,
        path,
      );
      upsertMessage(message);
    } catch {
      Alert.alert(t('chat.uploadFailedTitle'), t('chat.uploadFailedMessage'));
    } finally {
      setIsUploadingMedia(false);
    }
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

  const onEditMessage = useCallback((message: Message) => {
    if (!message.body) return;
    setPickerMessageId(null);
    setEditingMessageId(message.id);
    setDraft(message.body);
  }, []);

  const onCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setDraft('');
  }, []);

  const onDeleteMessage = useCallback(
    (messageId: string) => {
      setPickerMessageId(null);
      Alert.alert(t('chat.deleteConfirmTitle'), t('chat.deleteConfirmMessage'), [
        { text: t('chat.cancel'), style: 'cancel' },
        {
          text: t('chat.delete'),
          style: 'destructive',
          onPress: () => {
            void conversationsData.deleteMessage(messageId).then(() => {
              setMessages((current) =>
                current.filter((m) => m.id !== messageId),
              );
            });
          },
        },
      ]);
    },
    [t],
  );

  const latestMineMessageId = useMemo(
    () => messages.find((m) => m.sender_id === userId)?.id ?? null,
    [messages, userId],
  );

  const otherParticipant = useMemo(
    () => participants.find((p) => p.user_id !== userId),
    [participants, userId],
  );

  const seenLatestMine = useMemo(() => {
    if (!otherParticipant?.last_read_at || !latestMineMessageId) return false;
    const latestMineMessage = messages.find(
      (m) => m.id === latestMineMessageId,
    );
    if (!latestMineMessage) return false;
    return (
      new Date(otherParticipant.last_read_at) >=
      new Date(latestMineMessage.created_at)
    );
  }, [otherParticipant, latestMineMessageId, messages]);

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
            showSeen={
              item.sender_id === userId &&
              item.id === latestMineMessageId &&
              seenLatestMine
            }
            onLongPress={() =>
              setPickerMessageId((current) =>
                current === item.id ? null : item.id,
              )
            }
            onToggleReaction={(emoji) => void onToggleReaction(item.id, emoji)}
            onEdit={() => onEditMessage(item)}
            onDelete={() => onDeleteMessage(item.id)}
          />
        )}
      />
      {otherTyping && <Text style={styles.typingText}>{t('chat.typing')}</Text>}
      {editingMessageId && (
        <View style={styles.editingBar}>
          <Text style={styles.editingBarText}>{t('chat.editingMessage')}</Text>
          <TouchableOpacity onPress={onCancelEdit}>
            <Text style={styles.editingBarCancel}>{t('chat.cancel')}</Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={styles.composer}>
        <TouchableOpacity
          onPress={() => void onPickImage()}
          style={styles.attachButton}
          disabled={isUploadingMedia}
        >
          {isUploadingMedia ? (
            <ActivityIndicator size="small" />
          ) : (
            <Text style={styles.attachButtonText}>📷</Text>
          )}
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder={t('chat.messagePlaceholder')}
          value={draft}
          onChangeText={onChangeDraft}
          onSubmitEditing={() => void onSend()}
        />
        <TouchableOpacity onPress={() => void onSend()} style={styles.sendButton}>
          <Text style={styles.sendText}>
            {editingMessageId ? t('chat.save') : t('chat.send')}
          </Text>
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
  mediaBubble: {
    padding: 4,
    borderRadius: 12,
    maxWidth: '80%',
  },
  media: {
    width: 220,
    height: 220,
    borderRadius: 8,
  },
  mediaLoading: {
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bubbleMine: { backgroundColor: '#DCF8C6' },
  bubbleTheirs: { backgroundColor: '#F0F0F0' },
  editedTag: { fontSize: 10, color: '#666', marginTop: 2 },
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
  pickerActionText: { fontSize: 14, color: '#007AFF', fontWeight: '600' },
  pickerDeleteText: { color: '#FF3B30' },
  seenText: { fontSize: 11, color: '#999', marginTop: 2, marginRight: 4 },
  typingText: {
    fontSize: 12,
    color: '#999',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  editingBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#FFF8E1',
  },
  editingBarText: { fontSize: 12, color: '#666' },
  editingBarCancel: { fontSize: 12, color: '#007AFF', fontWeight: '600' },
  composer: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
    alignItems: 'center',
  },
  attachButton: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    marginRight: 4,
  },
  attachButtonText: { fontSize: 22 },
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