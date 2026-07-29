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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { AppStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import * as conversationsData from '../data/conversations';
import * as reactionsData from '../data/reactions';
import * as mediaData from '../data/media';
import { Avatar } from '../components/Avatar';
import { useContentWidth } from '../hooks/useContentWidth';
import { colors, radii, spacing, MAX_BUBBLE_WIDTH } from '../theme/tokens';
import { ConversationParticipant, Message, MessageReaction, ReplyPreview } from '../types';

type Props = NativeStackScreenProps<AppStackParamList, 'Chat'>;

const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];
const TYPING_BROADCAST_THROTTLE_MS = 2000;
const TYPING_INDICATOR_TIMEOUT_MS = 3000;

// Messages we've sent locally but haven't heard back from the server on
// yet - shown immediately (dimmed) instead of waiting on a round-trip.
type LocalMessage = Message & { _pending?: boolean };

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

function replySenderLabel(
  reply: ReplyPreview,
  userId: string | null,
  t: (key: string) => string,
): string {
  if (reply.sender_id === userId) return t('chat.you');
  return reply.profiles.display_name || reply.profiles.email;
}

function ReplyQuote({
  reply,
  userId,
  isMine,
}: {
  reply: ReplyPreview;
  userId: string | null;
  isMine: boolean;
}) {
  const { t } = useTranslation();
  const snippet = reply.deleted_at
    ? t('chat.deletedMessage')
    : reply.body || (reply.media_path ? t('conversations.photoPreview') : '');

  return (
    <View style={[styles.replyQuote, isMine ? styles.replyQuoteMine : styles.replyQuoteTheirs]}>
      <Text
        style={isMine ? styles.replyQuoteSenderMine : styles.replyQuoteSenderTheirs}
        numberOfLines={1}
      >
        {replySenderLabel(reply, userId, t)}
      </Text>
      <Text
        style={isMine ? styles.replyQuoteTextMine : styles.replyQuoteTextTheirs}
        numberOfLines={1}
      >
        {snippet}
      </Text>
    </View>
  );
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
  message: LocalMessage;
  isMine: boolean;
  senderName: string | null;
  reactions: MessageReaction[];
  userId: string | null;
  isPickerOpen: boolean;
  showSeen: boolean;
  bubbleMaxWidth: number;
  onLongPress: () => void;
  onToggleReaction: (emoji: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  onReply: () => void;
}

function MessageBubble({
  message,
  isMine,
  senderName,
  reactions,
  userId,
  isPickerOpen,
  showSeen,
  bubbleMaxWidth,
  onLongPress,
  onToggleReaction,
  onEdit,
  onDelete,
  onReply,
}: MessageBubbleProps) {
  const { t } = useTranslation();
  const summary = useMemo(
    () => summarizeReactions(reactions, userId),
    [reactions, userId],
  );

  return (
    <View style={isMine ? styles.rowMine : styles.rowTheirs}>
      {senderName && <Text style={styles.senderLabel}>{senderName}</Text>}
      <TouchableOpacity
        style={[
          message.media_path ? styles.mediaBubble : styles.bubble,
          { maxWidth: bubbleMaxWidth },
          isMine ? styles.bubbleMine : styles.bubbleTheirs,
          message._pending && styles.bubblePending,
        ]}
        onLongPress={onLongPress}
        activeOpacity={0.8}
      >
        {message.reply_to && (
          <ReplyQuote reply={message.reply_to} userId={userId} isMine={isMine} />
        )}
        {message.media_path && <MediaImage path={message.media_path} />}
        {message.body && (
          <Text style={isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs}>
            {message.body}
          </Text>
        )}
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
          {!message._pending && (
            <TouchableOpacity onPress={onReply} style={styles.pickerEmoji}>
              <Text style={styles.pickerActionText}>{t('chat.reply')}</Text>
            </TouchableOpacity>
          )}
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
  const insets = useSafeAreaInsets();
  const { windowWidth, contentWidth } = useContentWidth();
  const bubbleMaxWidth = Math.min(windowWidth * 0.8, MAX_BUBBLE_WIDTH);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [reactions, setReactions] = useState<MessageReaction[]>([]);
  const [participants, setParticipants] = useState<ConversationParticipant[]>(
    [],
  );
  const [isGroup, setIsGroup] = useState(false);
  const [draft, setDraft] = useState('');
  const [pickerMessageId, setPickerMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(
    null,
  );
  const [replyingTo, setReplyingTo] = useState<ReplyPreview | null>(null);
  const [otherTyping, setOtherTyping] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentAtRef = useRef(0);

  useEffect(() => {
    void conversationsData.fetchConversation(conversationId).then((conversation) => {
      setParticipants(conversation.conversation_participants);
      setIsGroup(conversation.is_group);
    });
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
        // Realtime postgres_changes payloads carry raw columns only, so a
        // reply's quoted preview has to be filled in from what's already
        // loaded locally (the replied-to message is almost always in view).
        let enriched = incoming;
        if (incoming.reply_to_message_id && !incoming.reply_to) {
          const replied = current.find(
            (m) => m.id === incoming.reply_to_message_id,
          );
          if (replied) {
            const profile = participants.find(
              (p) => p.user_id === replied.sender_id,
            )?.profiles ?? { id: replied.sender_id, email: '', display_name: '', avatar_path: null };
            enriched = {
              ...incoming,
              reply_to: {
                id: replied.id,
                body: replied.body,
                media_path: replied.media_path,
                sender_id: replied.sender_id,
                deleted_at: replied.deleted_at,
                profiles: profile,
              },
            };
          }
        }
        return [enriched, ...current];
      });
      markRead();
    },
    [markRead, participants],
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

    const replyToMessageId = replyingTo?.id ?? null;
    const replyToPreview = replyingTo;
    setReplyingTo(null);

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimisticMessage: LocalMessage = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: userId,
      body,
      media_path: null,
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      reply_to_message_id: replyToMessageId,
      reply_to: replyToPreview,
      _pending: true,
    };
    setMessages((current) => [optimisticMessage, ...current]);

    try {
      const message = await conversationsData.sendMessage(
        conversationId,
        userId,
        body,
        replyToMessageId,
      );
      setMessages((current) =>
        current.map((m) => (m.id === tempId ? message : m)),
      );
      markRead();
    } catch {
      setMessages((current) => current.filter((m) => m.id !== tempId));
      Alert.alert(t('chat.sendFailedTitle'), t('chat.sendFailedMessage'));
    }
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
    setReplyingTo(null);
    setEditingMessageId(message.id);
    setDraft(message.body);
  }, []);

  const onCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setDraft('');
  }, []);

  const onReplyToMessage = useCallback(
    (message: LocalMessage) => {
      setPickerMessageId(null);
      setEditingMessageId(null);
      const profile = participants.find(
        (p) => p.user_id === message.sender_id,
      )?.profiles ?? { id: message.sender_id, email: '', display_name: '', avatar_path: null };
      setReplyingTo({
        id: message.id,
        body: message.body,
        media_path: message.media_path,
        sender_id: message.sender_id,
        deleted_at: message.deleted_at,
        profiles: profile,
      });
    },
    [participants],
  );

  const onCancelReply = useCallback(() => setReplyingTo(null), []);

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

  const senderNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of participants) {
      map.set(p.user_id, p.profiles.display_name || p.profiles.email);
    }
    return map;
  }, [participants]);

  const displayTitle =
    title ||
    (isGroup
      ? t('conversations.groupChat')
      : otherParticipant?.profiles.display_name || otherParticipant?.profiles.email) ||
    '…';

  // Read receipts only make sense 1:1 for now - "seen" in a group would
  // need to say *who* has seen it, not just a single yes/no.
  const seenLatestMine = useMemo(() => {
    if (isGroup) return false;
    if (!otherParticipant?.last_read_at || !latestMineMessageId) return false;
    const latestMineMessage = messages.find(
      (m) => m.id === latestMineMessageId,
    );
    if (!latestMineMessage) return false;
    return (
      new Date(otherParticipant.last_read_at) >=
      new Date(latestMineMessage.created_at)
    );
  }, [isGroup, otherParticipant, latestMineMessageId, messages]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <View style={[styles.content, { maxWidth: contentWidth }]}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>‹</Text>
        </TouchableOpacity>
        <Avatar
          name={displayTitle}
          avatarPath={isGroup ? null : otherParticipant?.profiles.avatar_path}
          size={36}
        />
        <View>
          <Text style={styles.headerName}>{displayTitle}</Text>
          {otherTyping && <Text style={styles.headerStatus}>{t('chat.typing')}</Text>}
        </View>
      </View>

      <FlatList
        style={styles.list}
        data={messages}
        keyExtractor={(item) => item.id}
        inverted
        renderItem={({ item }) => (
          <MessageBubble
            message={item}
            isMine={item.sender_id === userId}
            senderName={
              isGroup && item.sender_id !== userId
                ? senderNames.get(item.sender_id) ?? null
                : null
            }
            reactions={reactions.filter((r) => r.message_id === item.id)}
            userId={userId}
            isPickerOpen={pickerMessageId === item.id}
            bubbleMaxWidth={bubbleMaxWidth}
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
            onReply={() => onReplyToMessage(item)}
          />
        )}
      />
      {editingMessageId && (
        <View style={styles.editingBar}>
          <Text style={styles.editingBarText}>{t('chat.editingMessage')}</Text>
          <TouchableOpacity onPress={onCancelEdit}>
            <Text style={styles.editingBarCancel}>{t('chat.cancel')}</Text>
          </TouchableOpacity>
        </View>
      )}
      {replyingTo && (
        <View style={styles.replyBar}>
          <View style={styles.replyBarText}>
            <Text style={styles.replyBarLabel}>
              {t('chat.replyingTo', {
                name: replySenderLabel(replyingTo, userId, t),
              })}
            </Text>
            <Text style={styles.replyBarSnippet} numberOfLines={1}>
              {replyingTo.deleted_at
                ? t('chat.deletedMessage')
                : replyingTo.body ||
                  (replyingTo.media_path ? t('conversations.photoPreview') : '')}
            </Text>
          </View>
          <TouchableOpacity onPress={onCancelReply}>
            <Text style={styles.editingBarCancel}>{t('chat.cancel')}</Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={[styles.composer, { paddingBottom: insets.bottom + spacing.md }]}>
        <TouchableOpacity
          onPress={() => void onPickImage()}
          style={styles.attachButton}
          disabled={isUploadingMedia}
        >
          {isUploadingMedia ? (
            <ActivityIndicator size="small" color={colors.smoke} />
          ) : (
            <Text style={styles.attachButtonText}>📷</Text>
          )}
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder={t('chat.messagePlaceholder')}
          placeholderTextColor={colors.smoke}
          value={draft}
          onChangeText={onChangeDraft}
          onSubmitEditing={() => void onSend()}
        />
        <TouchableOpacity onPress={() => void onSend()} style={styles.sendButton}>
          <Text style={styles.sendText}>
            {editingMessageId ? t('chat.save') : '➤'}
          </Text>
        </TouchableOpacity>
      </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { flex: 1, width: '100%', alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  backButton: { paddingHorizontal: 4, paddingVertical: 4 },
  backButtonText: { fontSize: 30, color: colors.ink, fontWeight: '300', marginTop: -4 },
  headerName: { fontWeight: '700', fontSize: 15, color: colors.ink },
  headerStatus: { fontSize: 11.5, fontWeight: '600', color: colors.sage },
  list: { flex: 1, paddingHorizontal: 12 },
  rowMine: { alignItems: 'flex-end', marginVertical: 4 },
  rowTheirs: { alignItems: 'flex-start', marginVertical: 4 },
  bubble: {
    padding: 10,
    paddingHorizontal: 14,
    borderRadius: 19,
  },
  mediaBubble: {
    padding: 4,
    borderRadius: 16,
  },
  media: {
    width: 220,
    height: 220,
    borderRadius: 14,
  },
  mediaLoading: {
    backgroundColor: colors.line,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bubbleMine: { backgroundColor: colors.ember, borderBottomRightRadius: 6 },
  bubbleTheirs: { backgroundColor: colors.paper2, borderBottomLeftRadius: 6 },
  bubblePending: { opacity: 0.55 },
  senderLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.smoke,
    marginBottom: 2,
    marginLeft: 4,
  },
  bubbleTextMine: { color: colors.white, fontSize: 14.5, lineHeight: 20 },
  bubbleTextTheirs: { color: colors.ink, fontSize: 14.5, lineHeight: 20 },
  editedTag: { fontSize: 10, color: colors.smoke, marginTop: 2 },
  replyQuote: {
    borderLeftWidth: 3,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 6,
  },
  replyQuoteMine: {
    borderLeftColor: colors.white,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  replyQuoteTheirs: {
    borderLeftColor: colors.ember,
    backgroundColor: colors.paper,
  },
  replyQuoteSenderMine: { fontSize: 12, fontWeight: '700', color: colors.white },
  replyQuoteSenderTheirs: { fontSize: 12, fontWeight: '700', color: colors.ember },
  replyQuoteTextMine: { fontSize: 12.5, color: 'rgba(255, 255, 255, 0.85)' },
  replyQuoteTextTheirs: { fontSize: 12.5, color: colors.smoke },
  reactionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    gap: 4,
  },
  reactionPill: {
    flexDirection: 'row',
    backgroundColor: colors.paper2,
    borderRadius: radii.lg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  reactionPillMine: { borderColor: colors.ember },
  reactionPillText: { fontSize: 13 },
  picker: {
    flexDirection: 'row',
    backgroundColor: colors.paper2,
    borderRadius: radii.xl,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginTop: 6,
    shadowColor: colors.ink,
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  pickerEmoji: { paddingHorizontal: 6 },
  pickerEmojiText: { fontSize: 22 },
  pickerActionText: { fontSize: 14, color: colors.ember, fontWeight: '600' },
  pickerDeleteText: { color: colors.danger },
  seenText: { fontSize: 11, color: colors.smoke, marginTop: 2, marginRight: 4 },
  editingBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.paper2,
  },
  editingBarText: { fontSize: 12, color: colors.smoke },
  editingBarCancel: { fontSize: 12, color: colors.ember, fontWeight: '600' },
  replyBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.paper2,
    gap: spacing.md,
  },
  replyBarText: { flex: 1 },
  replyBarLabel: { fontSize: 12, fontWeight: '700', color: colors.ember },
  replyBarSnippet: { fontSize: 12, color: colors.smoke, marginTop: 1 },
  composer: {
    flexDirection: 'row',
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
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
    backgroundColor: colors.paper2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    marginRight: spacing.sm,
    color: colors.ink,
    fontSize: 14.5,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.ember,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: { color: colors.white, fontWeight: '700', fontSize: 14 },
});