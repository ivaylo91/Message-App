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
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import FastImage from '@d11/react-native-fast-image';
import LinearGradient from 'react-native-linear-gradient';
import {
  errorCodes,
  isErrorWithCode,
  pick,
} from '@react-native-documents/picker';
import Sound, { type RecordBackType } from 'react-native-nitro-sound';
import { FontAwesome6 } from '@react-native-vector-icons/fontawesome6/static';
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
import * as moderationData from '../data/moderation';
import type { ReportReason } from '../data/moderation';
import { Avatar } from '../components/Avatar';
import { AppWallpaper } from '../components/AppWallpaper';
import { AppLogo } from '../components/AppLogo';
import { FooterNav } from '../components/FooterNav';
import { useToast } from '../components/Toast';
import { useCall } from '../calling/CallContext';
import { useContentWidth } from '../hooks/useContentWidth';
import { usePresence } from '../presence/PresenceContext';
import { useUnread } from '../unread/UnreadContext';
import { useOutbox } from '../offline/OutboxContext';
import { OutboxEntry } from '../offline/outboxStorage';
import {
  attachmentPreviewText,
  callStatusPreviewText,
  fileIconName,
  formatDuration,
} from '../utils/messagePreview';
import { radii, spacing, MAX_BUBBLE_WIDTH, ThemeColors } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';
import { ConversationParticipant, Message, MessageReaction, ReplyPreview } from '../types';

type Props = NativeStackScreenProps<AppStackParamList, 'Chat'>;

const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];
const TYPING_BROADCAST_THROTTLE_MS = 2000;
const TYPING_INDICATOR_TIMEOUT_MS = 3000;
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_SELECTION = 10;
const SEARCH_DEBOUNCE_MS = 300;

// Messages we've sent locally but haven't heard back from the server on
// yet - shown immediately (dimmed) instead of waiting on a round-trip.
type LocalMessage = Message & { _pending?: boolean };

// An outbox entry hasn't reached the server at all yet (still queued,
// possibly offline) - rendered the same dimmed way as a fresher
// in-flight send. Once it actually sends, the outbox drops the entry
// and the real row arrives through the normal realtime INSERT
// subscription, so this is never reconciled by id - it just stops being
// in the list.
function pendingToLocalMessage(entry: OutboxEntry, senderId: string): LocalMessage {
  return {
    id: entry.tempId,
    conversation_id: entry.conversationId,
    sender_id: senderId,
    body: entry.body,
    media_path: null,
    attachment_type: null,
    attachment_name: null,
    attachment_mime_type: null,
    attachment_duration_ms: null,
    call_status: null,
    created_at: entry.createdAt,
    edited_at: null,
    deleted_at: null,
    reply_to_message_id: entry.replyToMessageId,
    reply_to: entry.replyToPreview,
    _pending: true,
  };
}

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

const WAVEFORM_BAR_COUNT = 24;
const WAVEFORM_MIN_HEIGHT = 4;
const WAVEFORM_MAX_HEIGHT = 20;

// Real audio waveforms would need decoding the file itself just for a
// decorative visual - instead this derives a fixed-looking one from the
// message id, so the same voice message always renders the same "shape"
// (and different messages look different) without any audio analysis.
function waveformHeights(seed: string, count: number): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const heights: number[] = [];
  for (let i = 0; i < count; i++) {
    hash = (hash * 1103515245 + 12345) >>> 0;
    const t = (hash % 1000) / 1000;
    heights.push(WAVEFORM_MIN_HEIGHT + t * (WAVEFORM_MAX_HEIGHT - WAVEFORM_MIN_HEIGHT));
  }
  return heights;
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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const snippet = reply.deleted_at
    ? t('chat.deletedMessage')
    : reply.body || attachmentPreviewText(reply.attachment_type, reply.attachment_name, t) || '';

  return (
    <View style={styles.replyQuote}>
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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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

  return (
    <FastImage
      source={{ uri: url }}
      style={styles.media}
      resizeMode={FastImage.resizeMode.cover}
    />
  );
}

function AudioMessageBubble({
  message,
  isMine,
  isPlaying,
  onTogglePlay,
}: {
  message: LocalMessage;
  isMine: boolean;
  isPlaying: boolean;
  onTogglePlay: () => void;
}) {
  const { colors, gradients } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const totalSeconds = Math.round((message.attachment_duration_ms ?? 0) / 1000);
  const waveform = useMemo(
    () => waveformHeights(message.id, WAVEFORM_BAR_COUNT),
    [message.id],
  );

  return (
    <TouchableOpacity
      style={styles.audioRow}
      onPress={onTogglePlay}
      disabled={message._pending}
    >
      <View style={[styles.iconCircle, isMine ? styles.iconCircleMine : styles.iconCircleTheirs]}>
        <FontAwesome6
          name={isPlaying ? 'pause' : 'play'}
          iconStyle="solid"
          size={13}
          color={isMine ? gradients.mine[0] : colors.white}
        />
      </View>
      <View style={styles.waveform}>
        {waveform.map((height, i) => (
          <View
            key={i}
            style={[
              styles.waveformBar,
              {
                height,
                backgroundColor: isMine ? colors.white : colors.ink,
                opacity: isMine ? 0.85 : 0.5,
              },
            ]}
          />
        ))}
      </View>
      <Text style={isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs}>
        {formatDuration(totalSeconds)}
      </Text>
    </TouchableOpacity>
  );
}

function CallLogRow({ message, isMine }: { message: LocalMessage; isMine: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const label = callStatusPreviewText(message.call_status, message.attachment_duration_ms, t);

  return (
    <View style={styles.callLogRow}>
      <FontAwesome6
        name={message.call_status === 'completed' ? 'video' : 'video-slash'}
        iconStyle="solid"
        size={14}
        color={isMine ? colors.white : colors.ink}
      />
      <Text style={isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs}>{label}</Text>
    </View>
  );
}

function FileMessageBubble({ message, isMine }: { message: LocalMessage; isMine: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const onOpen = async () => {
    if (!message.media_path || message._pending) return;
    const url = await mediaData.getMediaSignedUrl(message.media_path);
    void Linking.openURL(url);
  };

  return (
    <TouchableOpacity
      style={styles.fileRow}
      onPress={() => void onOpen()}
      disabled={message._pending}
    >
      <View style={[styles.iconCircle, isMine ? styles.iconCircleMine : styles.iconCircleTheirs]}>
        <FontAwesome6
          name={fileIconName(message.attachment_mime_type)}
          iconStyle="solid"
          size={16}
          color={isMine ? colors.ember : colors.white}
        />
      </View>
      <Text
        style={[styles.fileName, isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs]}
        numberOfLines={1}
      >
        {message.attachment_name || t('chat.file')}
      </Text>
    </TouchableOpacity>
  );
}

interface MessageBubbleProps {
  message: LocalMessage;
  isMine: boolean;
  senderName: string | null;
  reactions: MessageReaction[];
  userId: string | null;
  isPickerOpen: boolean;
  isHighlighted: boolean;
  seenBy: { name: string; avatarPath: string | null }[];
  bubbleMaxWidth: number;
  isPlaying: boolean;
  onLongPress: () => void;
  onDismissPicker: () => void;
  onToggleReaction: (emoji: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  onReply: () => void;
  onReport: () => void;
  onTogglePlay: () => void;
}

function MessageBubble({
  message,
  isMine,
  senderName,
  reactions,
  userId,
  isPickerOpen,
  isHighlighted,
  seenBy,
  bubbleMaxWidth,
  isPlaying,
  onLongPress,
  onDismissPicker,
  onToggleReaction,
  onEdit,
  onDelete,
  onReply,
  onReport,
  onTogglePlay,
}: MessageBubbleProps) {
  const { t } = useTranslation();
  const { colors, gradients } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const summary = useMemo(
    () => summarizeReactions(reactions, userId),
    [reactions, userId],
  );

  return (
    <View style={isMine ? styles.rowMine : styles.rowTheirs}>
      {senderName && <Text style={styles.senderLabel}>{senderName}</Text>}
      <TouchableOpacity onLongPress={onLongPress} onPress={onDismissPicker} activeOpacity={0.8}>
        <LinearGradient
          colors={isMine ? [...gradients.mine] : [...gradients.theirs]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            message.attachment_type === 'image' ? styles.mediaBubble : styles.bubble,
            { maxWidth: bubbleMaxWidth },
            message._pending && styles.bubblePending,
            isHighlighted && styles.bubbleHighlighted,
          ]}
        >
          {message.reply_to && (
            <ReplyQuote reply={message.reply_to} userId={userId} isMine={isMine} />
          )}
          {message.call_status && <CallLogRow message={message} isMine={isMine} />}
          {message.attachment_type === 'image' && message.media_path && (
            <MediaImage path={message.media_path} />
          )}
          {message.attachment_type === 'audio' && (
            <AudioMessageBubble
              message={message}
              isMine={isMine}
              isPlaying={isPlaying}
              onTogglePlay={onTogglePlay}
            />
          )}
          {message.attachment_type === 'file' && (
            <FileMessageBubble message={message} isMine={isMine} />
          )}
          {message.body && (
            <Text style={isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs}>
              {message.body}
            </Text>
          )}
          {message.edited_at && <Text style={styles.editedTag}>{t('chat.edited')}</Text>}
        </LinearGradient>
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
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.picker, { maxWidth: bubbleMaxWidth }]}
          contentContainerStyle={styles.pickerContent}
        >
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
          {!isMine && !message._pending && (
            <TouchableOpacity onPress={onReport} style={styles.pickerEmoji}>
              <Text style={[styles.pickerActionText, styles.pickerDeleteText]}>
                {t('chat.reportTitle')}
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {seenBy.length > 0 && (
        <View style={styles.seenAvatar}>
          {seenBy.map((person) => (
            <Avatar key={person.name} name={person.name} avatarPath={person.avatarPath} size={16} />
          ))}
        </View>
      )}
    </View>
  );
}

const TYPING_DOT_BOUNCE_MS = 300;
const TYPING_DOT_STAGGER_MS = 150;

function TypingDot({ delay }: { delay: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const bounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(bounce, {
          toValue: 1,
          duration: TYPING_DOT_BOUNCE_MS,
          useNativeDriver: true,
        }),
        Animated.timing(bounce, {
          toValue: 0,
          duration: TYPING_DOT_BOUNCE_MS,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bounce, delay]);

  return (
    <Animated.View
      style={[
        styles.typingDot,
        {
          opacity: bounce.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
          transform: [
            {
              translateY: bounce.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }),
            },
          ],
        },
      ]}
    />
  );
}

// Rendered as the FlatList's ListHeaderComponent - since the list is
// inverted, the "header" slot visually sits at the bottom, right where
// the other person's next message would appear.
function TypingBubble() {
  const { colors, gradients } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.rowTheirs}>
      <LinearGradient
        colors={[...gradients.theirs]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.bubble, styles.typingBubble]}
      >
        <TypingDot delay={0} />
        <TypingDot delay={TYPING_DOT_STAGGER_MS} />
        <TypingDot delay={TYPING_DOT_STAGGER_MS * 2} />
      </LinearGradient>
    </View>
  );
}

export function ChatScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { conversationId, title } = route.params;
  const { userId } = useAuth();
  const { showToast } = useToast();
  const { isOnline } = usePresence();
  const { markConversationRead } = useUnread();
  const outbox = useOutbox();
  const { startCall } = useCall();
  const insets = useSafeAreaInsets();
  const { windowWidth, contentWidth } = useContentWidth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<conversationsData.MessageSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [isOtherBlocked, setIsOtherBlocked] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentAtRef = useRef(0);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flatListRef = useRef<FlatList<LocalMessage>>(null);
  // Kept in sync with `participants` below and read from inside
  // upsertMessage instead of depending on `participants` directly - that
  // state updates asynchronously right after mount (once fetchConversation
  // resolves), and having upsertMessage depend on it gave it a new identity
  // at that point. Since the realtime-channel effect further down depends
  // on upsertMessage, that made it tear down and recreate the channel via
  // an un-awaited removeChannel(), which raced ahead of the actual removal:
  // the next .channel() call for the same topic got back the still-not-
  // fully-removed, already-subscribed channel, and calling .on(...) on it
  // threw "cannot add postgres_changes callbacks ... after subscribe()" -
  // crashing the screen almost every time a chat was opened.
  const participantsRef = useRef<ConversationParticipant[]>([]);

  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  useEffect(() => {
    void conversationsData.fetchConversation(conversationId).then((conversation) => {
      setParticipants(conversation.conversation_participants);
      setIsGroup(conversation.is_group);
    });
  }, [conversationId]);

  // The composer's bottom safe-area padding (for the home indicator/
  // gesture bar) should only apply when that area is actually visible -
  // once the keyboard is up it occupies that space instead, and the
  // composer should sit flush on top of it, not float above with a gap.
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () =>
      setIsKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener('keyboardDidHide', () =>
      setIsKeyboardVisible(false),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Leaving the chat mid-recording or mid-playback shouldn't leave the
  // recorder running or audio playing in the background. Nothing here
  // was necessarily ever started (the common case - opening a chat and
  // leaving without touching the mic/playback), and nitro-sound throws
  // synchronously (not just a rejected promise) when told to stop a
  // recorder/player that was never running, so each call needs its own
  // try/catch - a bare .catch() only guards against rejection.
  useEffect(() => {
    return () => {
      try {
        Sound.stopRecorder().catch(() => {});
      } catch {
        // no active recorder session - nothing to stop
      }
      try {
        Sound.removeRecordBackListener();
      } catch {
        // no listener was ever attached
      }
      try {
        Sound.stopPlayer().catch(() => {});
      } catch {
        // no active player session - nothing to stop
      }
      try {
        Sound.removePlaybackEndListener();
      } catch {
        // no listener was ever attached
      }
    };
  }, []);

  const markRead = useCallback(() => {
    if (!userId) return;
    markConversationRead(conversationId);
  }, [conversationId, userId, markConversationRead]);

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
            const profile = participantsRef.current.find(
              (p) => p.user_id === replied.sender_id,
            )?.profiles ?? { id: replied.sender_id, email: '', display_name: '', avatar_path: null, username: null, phone: null };
            enriched = {
              ...incoming,
              reply_to: {
                id: replied.id,
                body: replied.body,
                media_path: replied.media_path,
                attachment_type: replied.attachment_type,
                attachment_name: replied.attachment_name,
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
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    // Supabase's client reuses any existing channel object already
    // registered under this exact topic instead of creating a fresh one
    // (see RealtimeClient.channel() upstream) - and removeChannel() is
    // async (it awaits an unsubscribe round-trip before deregistering).
    // If this effect re-runs before a previous run's un-awaited
    // removeChannel() call has actually finished (observed even without
    // React StrictMode - e.g. rapid re-focus), the "new" channel() call
    // below hands back that same already-subscribed channel, and the
    // .on(...) calls after it throw "cannot add ... callbacks ... after
    // subscribe()", crashing the screen. Awaiting the removal of any
    // stale same-topic channel first closes that race unconditionally.
    void (async () => {
      const realtimeTopic = `realtime:messages:${conversationId}`;
      const stale = supabase.getChannels().find((c) => c.topic === realtimeTopic);
      if (stale) await supabase.removeChannel(stale);
      if (cancelled) return;

      channel = supabase
        .channel(`messages:${conversationId}`, { config: { private: true } })
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
    })();

    return () => {
      cancelled = true;
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (channel) void supabase.removeChannel(channel);
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

    // Queued rather than sent directly - the outbox shows it immediately
    // (dimmed, via displayMessages) and takes care of retrying if this
    // fails or the device is offline, instead of the send just erroring
    // out. See OutboxContext for the retry/persistence behavior.
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    outbox.queueMessage({
      conversationId,
      tempId,
      body,
      replyToMessageId,
      replyToPreview,
    });
    markRead();
  };

  const onPickImage = async () => {
    if (!userId) return;
    const result = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.7,
      selectionLimit: MAX_IMAGE_SELECTION,
    });
    const assets = result.assets ?? [];
    if (assets.length === 0) return;

    setIsUploadingAttachment(true);
    try {
      // Sequential, not concurrent - keeps the sent order matching
      // selection order and avoids firing a burst of large uploads at
      // once (each one already going through mediaData.uploadMedia's
      // own network round trip).
      for (const asset of assets) {
        if (!asset.uri) continue;
        const mimeType = asset.type ?? 'image/jpeg';
        const path = await mediaData.uploadMedia(conversationId, asset.uri, mimeType);
        const message = await conversationsData.sendAttachmentMessage(conversationId, userId, {
          path,
          type: 'image',
          mimeType,
        });
        upsertMessage(message);
      }
    } catch {
      Alert.alert(t('chat.uploadFailedTitle'), t('chat.uploadFailedMessage'));
    } finally {
      setIsUploadingAttachment(false);
    }
  };

  const onPickFile = async () => {
    if (!userId) return;
    let picked;
    try {
      [picked] = await pick({ mode: 'import' });
    } catch (err) {
      if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) return;
      Alert.alert(t('chat.uploadFailedTitle'), t('chat.uploadFailedMessage'));
      return;
    }
    if (!picked) return;
    if (picked.size && picked.size > MAX_FILE_SIZE_BYTES) {
      Alert.alert(t('chat.fileTooLargeTitle'), t('chat.fileTooLargeMessage'));
      return;
    }

    setIsUploadingAttachment(true);
    try {
      const mimeType = picked.type ?? 'application/octet-stream';
      const path = await mediaData.uploadMedia(conversationId, picked.uri, mimeType, picked.name);
      const message = await conversationsData.sendAttachmentMessage(conversationId, userId, {
        path,
        type: 'file',
        name: picked.name,
        mimeType,
      });
      upsertMessage(message);
    } catch {
      Alert.alert(t('chat.uploadFailedTitle'), t('chat.uploadFailedMessage'));
    } finally {
      setIsUploadingAttachment(false);
    }
  };

  const onStartRecording = async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) return;
    }
    try {
      await Sound.startRecorder();
      setRecordingSeconds(0);
      Sound.addRecordBackListener((e: RecordBackType) => {
        setRecordingSeconds(Math.floor(e.currentPosition / 1000));
      });
      setIsRecording(true);
    } catch {
      Alert.alert(t('chat.recordFailedTitle'), t('chat.recordFailedMessage'));
    }
  };

  const onStopRecording = async (shouldSend: boolean) => {
    let uri: string;
    try {
      uri = await Sound.stopRecorder();
    } finally {
      Sound.removeRecordBackListener();
      setIsRecording(false);
    }
    if (!shouldSend || !userId) return;

    setIsUploadingAttachment(true);
    try {
      const durationMs = recordingSeconds * 1000;
      const mimeType = Platform.OS === 'ios' ? 'audio/m4a' : 'audio/mp4';
      const fileUri = uri.startsWith('file://') ? uri : `file://${uri}`;
      const path = await mediaData.uploadMedia(conversationId, fileUri, mimeType);
      const message = await conversationsData.sendAttachmentMessage(conversationId, userId, {
        path,
        type: 'audio',
        mimeType,
        durationMs,
      });
      upsertMessage(message);
    } catch {
      Alert.alert(t('chat.uploadFailedTitle'), t('chat.uploadFailedMessage'));
    } finally {
      setIsUploadingAttachment(false);
    }
  };

  const onTogglePlayback = async (message: LocalMessage) => {
    if (!message.media_path) return;

    if (playingMessageId) {
      await Sound.stopPlayer();
      Sound.removePlaybackEndListener();
      setPlayingMessageId(null);
      if (playingMessageId === message.id) return;
    }

    try {
      const url = await mediaData.getMediaSignedUrl(message.media_path);
      await Sound.startPlayer(url);
      Sound.addPlaybackEndListener(() => {
        Sound.removePlaybackEndListener();
        setPlayingMessageId(null);
      });
      setPlayingMessageId(message.id);
    } catch {
      setPlayingMessageId(null);
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
      )?.profiles ?? { id: message.sender_id, email: '', display_name: '', avatar_path: null, username: null, phone: null };
      setReplyingTo({
        id: message.id,
        body: message.body,
        media_path: message.media_path,
        attachment_type: message.attachment_type,
        attachment_name: message.attachment_name,
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

  const onChangeSearchQuery = useCallback(
    (text: string) => {
      setSearchQuery(text);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      if (!text.trim()) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      searchDebounceRef.current = setTimeout(() => {
        conversationsData
          .searchMessages(conversationId, text)
          .then(setSearchResults)
          .finally(() => setIsSearching(false));
      }, SEARCH_DEBOUNCE_MS);
    },
    [conversationId],
  );

  const onCloseSearch = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    setIsSearching(false);
  }, []);

  // If the tapped result isn't in the ~50 messages already loaded (this
  // screen doesn't paginate history otherwise), fetch a fresh window
  // centered on it first - either way, highlighting + scrolling happens
  // in the effect below once it's actually in `messages`.
  const onSelectSearchResult = useCallback(
    async (result: conversationsData.MessageSearchResult) => {
      onCloseSearch();
      const alreadyLoaded = messages.some((m) => m.id === result.id);
      if (!alreadyLoaded) {
        const around = await conversationsData.fetchMessagesAround(conversationId, result.id);
        setMessages(around);
      }
      setHighlightedMessageId(result.id);
    },
    [conversationId, messages, onCloseSearch],
  );

  useEffect(() => {
    if (!highlightedMessageId) return;
    const item = messages.find((m) => m.id === highlightedMessageId);
    if (!item) return;

    const scrollTimeout = setTimeout(() => {
      flatListRef.current?.scrollToItem({ item, animated: true, viewPosition: 0.5 });
    }, 100);
    const clearTimeout_ = setTimeout(() => setHighlightedMessageId(null), 2500);

    return () => {
      clearTimeout(scrollTimeout);
      clearTimeout(clearTimeout_);
    };
  }, [highlightedMessageId, messages]);

  const otherParticipant = useMemo(
    () => participants.find((p) => p.user_id !== userId),
    [participants, userId],
  );

  useEffect(() => {
    if (!userId || !otherParticipant) return;
    let cancelled = false;
    void moderationData.fetchBlockedUserIds(userId).then((blocked) => {
      if (!cancelled) setIsOtherBlocked(blocked.has(otherParticipant.user_id));
    });
    return () => {
      cancelled = true;
    };
  }, [userId, otherParticipant]);

  const onToggleBlockOther = useCallback(() => {
    if (!userId || !otherParticipant) return;
    const otherName = otherParticipant.profiles.display_name || otherParticipant.profiles.email;
    const otherId = otherParticipant.user_id;

    if (isOtherBlocked) {
      Alert.alert(t('chat.unblockConfirmTitle'), t('chat.unblockConfirmMessage', { name: otherName }), [
        { text: t('chat.cancel'), style: 'cancel' },
        {
          text: t('chat.unblock'),
          onPress: () => {
            void moderationData
              .unblockUser(userId, otherId)
              .then(() => {
                setIsOtherBlocked(false);
                showToast(t('chat.unblockSuccessToast'));
              })
              .catch(() => Alert.alert(t('chat.blockFailedTitle'), t('chat.blockFailedMessage')));
          },
        },
      ]);
      return;
    }

    Alert.alert(t('chat.blockConfirmTitle'), t('chat.blockConfirmMessage', { name: otherName }), [
      { text: t('chat.cancel'), style: 'cancel' },
      {
        text: t('chat.block'),
        style: 'destructive',
        onPress: () => {
          void moderationData
            .blockUser(userId, otherId)
            .then(() => {
              setIsOtherBlocked(true);
              showToast(t('chat.blockSuccessToast'));
            })
            .catch(() => Alert.alert(t('chat.blockFailedTitle'), t('chat.blockFailedMessage')));
        },
      },
    ]);
  }, [userId, otherParticipant, isOtherBlocked, t, showToast]);

  const onReportUser = useCallback(
    (reportedUserId: string, messageId?: string) => {
      if (!userId) return;
      const reasons: { key: ReportReason; label: string }[] = [
        { key: 'spam', label: t('chat.reportReasonSpam') },
        { key: 'harassment', label: t('chat.reportReasonHarassment') },
        { key: 'inappropriate_content', label: t('chat.reportReasonInappropriate') },
        { key: 'other', label: t('chat.reportReasonOther') },
      ];
      Alert.alert(
        t('chat.reportTitle'),
        t('chat.reportMessage'),
        [
          ...reasons.map((reason) => ({
            text: reason.label,
            onPress: () => {
              void moderationData
                .reportUser(userId, reportedUserId, reason.key, { messageId })
                .then(() => showToast(t('chat.reportSuccessToast')))
                .catch(() => Alert.alert(t('chat.reportFailedTitle'), t('chat.reportFailedMessage')));
            },
          })),
          { text: t('chat.cancel'), style: 'cancel' },
        ],
      );
    },
    [userId, t, showToast],
  );

  const onOpenChatMenu = useCallback(() => {
    if (!otherParticipant) return;
    Alert.alert(t('chat.menuTitle'), undefined, [
      {
        text: isOtherBlocked ? t('chat.unblock') : t('chat.block'),
        style: isOtherBlocked ? 'default' : 'destructive',
        onPress: onToggleBlockOther,
      },
      {
        text: t('chat.reportTitle'),
        onPress: () => onReportUser(otherParticipant.user_id),
      },
      { text: t('chat.cancel'), style: 'cancel' },
    ]);
  }, [otherParticipant, isOtherBlocked, onToggleBlockOther, onReportUser, t]);

  // Newest-first, matching `messages` (see fetchMessages) - queued
  // entries are stored oldest-first so they're reversed before being
  // stacked on top of the confirmed, server-fetched messages.
  const displayMessages = useMemo(() => {
    if (!userId) return messages;
    const pending = outbox.pendingByConversation[conversationId] ?? [];
    if (pending.length === 0) return messages;
    // A pending (optimistic) entry and the real message it becomes can
    // briefly both be visible: the real one can arrive over the realtime
    // channel - raw columns only, no joins (see upsertMessage) - before
    // sendMessage()'s own insert+select response comes back, since that
    // select is the heavier one (it joins in reply_to). The outbox only
    // clears the pending entry once *its* response returns, so realtime
    // winning that race left both on screen at once. Matching on content
    // here drops the pending copy the moment its real counterpart has
    // actually landed, instead of waiting on the slower response too.
    //
    // Deliberately not also comparing timestamps to only match messages
    // sent *after* the pending entry was queued: m.created_at is a
    // server timestamp and entry.createdAt is stamped from the device's
    // own clock, and any clock skew between the two (common enough on
    // real devices) could make a real match fail that check, leaving
    // the pending copy stuck on screen permanently instead of just
    // briefly - a persistent duplicate is worse than the rare cosmetic
    // cost of a same-text repeat send hiding its own "sending..." dot.
    const stillPending = pending.filter(
      (entry) =>
        !messages.some(
          (m) =>
            m.sender_id === userId &&
            m.body === entry.body &&
            m.reply_to_message_id === entry.replyToMessageId,
        ),
    );
    if (stillPending.length === 0) return messages;
    const pendingNewestFirst = [...stillPending]
      .reverse()
      .map((entry) => pendingToLocalMessage(entry, userId));
    return [...pendingNewestFirst, ...messages];
  }, [messages, outbox.pendingByConversation, conversationId, userId]);

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

  // Messenger-style read receipts: for each other participant, the
  // newest message of mine at or before *their* last_read_at is where
  // their avatar sits, moving down as that timestamp advances in real
  // time. The same per-participant logic covers both 1:1 (one avatar)
  // and groups (participants who've read different amounts each land
  // under their own newest-seen message, stacking together when several
  // people happen to have read up to the same point).
  const seenAvatarsByMessageId = useMemo(() => {
    const result = new Map<string, { name: string; avatarPath: string | null }[]>();
    for (const participant of participants) {
      if (participant.user_id === userId || !participant.last_read_at) continue;
      const readAt = new Date(participant.last_read_at).getTime();
      const seen = messages.find(
        (m) => m.sender_id === userId && new Date(m.created_at).getTime() <= readAt,
      );
      if (!seen) continue;
      const list = result.get(seen.id) ?? [];
      list.push({
        name: participant.profiles.display_name || participant.profiles.email,
        avatarPath: participant.profiles.avatar_path,
      });
      result.set(seen.id, list);
    }
    return result;
  }, [participants, messages, userId]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <AppWallpaper />
      <TouchableWithoutFeedback onPress={() => setPickerMessageId(null)}>
      <View style={[styles.content, { maxWidth: contentWidth }]}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <FontAwesome6 name="chevron-left" iconStyle="solid" size={18} color={colors.ink} />
        </TouchableOpacity>
        <Avatar
          name={displayTitle}
          avatarPath={isGroup ? null : otherParticipant?.profiles.avatar_path}
          size={36}
          online={
            isGroup || !otherParticipant ? undefined : isOnline(otherParticipant.user_id)
          }
        />
        <View style={styles.headerNameBlock}>
          <Text style={styles.headerName}>{displayTitle}</Text>
          {!otherTyping &&
            !isGroup &&
            otherParticipant &&
            isOnline(otherParticipant.user_id) && (
              <Text style={styles.headerStatus}>{t('chat.online')}</Text>
            )}
        </View>
        <TouchableOpacity style={styles.callButton} onPress={() => setIsSearchOpen(true)}>
          <FontAwesome6 name="magnifying-glass" iconStyle="solid" size={16} color={colors.ink} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.callButton}
          onPress={() => navigation.navigate('MediaGallery', { conversationId, title: displayTitle })}
        >
          <FontAwesome6 name="images" iconStyle="solid" size={16} color={colors.ink} />
        </TouchableOpacity>
        {!isGroup && otherParticipant && (
          <TouchableOpacity
            style={styles.callButton}
            onPress={() =>
              void startCall({
                conversationId,
                peerUserId: otherParticipant.user_id,
                peerName: displayTitle,
                peerAvatarPath: otherParticipant.profiles.avatar_path,
              })
            }
          >
            <FontAwesome6 name="video" iconStyle="solid" size={17} color={colors.ember} />
          </TouchableOpacity>
        )}
        {!isGroup && otherParticipant && (
          <TouchableOpacity style={styles.callButton} onPress={onOpenChatMenu}>
            <FontAwesome6 name="ellipsis-vertical" iconStyle="solid" size={16} color={colors.ink} />
          </TouchableOpacity>
        )}
        <AppLogo size={26} />
      </View>

      {!outbox.isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>{t('chat.offlineBanner')}</Text>
        </View>
      )}

      {isSearchOpen && (
        <View style={styles.searchBar}>
          <FontAwesome6 name="magnifying-glass" iconStyle="solid" size={14} color={colors.smoke} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('chat.searchPlaceholder')}
            placeholderTextColor={colors.smoke}
            value={searchQuery}
            onChangeText={onChangeSearchQuery}
            autoFocus
          />
          <TouchableOpacity onPress={onCloseSearch}>
            <FontAwesome6 name="xmark" iconStyle="solid" size={16} color={colors.smoke} />
          </TouchableOpacity>
        </View>
      )}

      {isSearchOpen ? (
        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          {isSearching && <ActivityIndicator color={colors.ember} style={styles.spinner} />}
          {!isSearching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
            <Text style={styles.searchEmptyText}>{t('chat.noSearchResults')}</Text>
          )}
          {searchResults.map((result) => (
            <TouchableOpacity
              key={result.id}
              style={styles.searchResultRow}
              onPress={() => void onSelectSearchResult(result)}
            >
              <Text style={styles.searchResultSender}>
                {result.sender_id === userId ? t('chat.you') : displayTitle}
              </Text>
              <Text style={styles.searchResultSnippet} numberOfLines={1}>
                {result.body}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        <FlatList
          ref={flatListRef}
          style={styles.list}
          data={displayMessages}
          keyExtractor={(item) => item.id}
          inverted
          ListHeaderComponent={otherTyping ? TypingBubble : null}
          onScrollToIndexFailed={(info) => {
            setTimeout(
              () => flatListRef.current?.scrollToIndex({ index: info.index, animated: true }),
              100,
            );
          }}
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
              isHighlighted={item.id === highlightedMessageId}
              bubbleMaxWidth={bubbleMaxWidth}
              isPlaying={playingMessageId === item.id}
              seenBy={seenAvatarsByMessageId.get(item.id) ?? []}
              onLongPress={() =>
                setPickerMessageId((current) =>
                  current === item.id ? null : item.id,
                )
              }
              onDismissPicker={() => setPickerMessageId(null)}
              onToggleReaction={(emoji) => void onToggleReaction(item.id, emoji)}
              onEdit={() => onEditMessage(item)}
              onDelete={() => onDeleteMessage(item.id)}
              onReply={() => onReplyToMessage(item)}
              onReport={() => {
                setPickerMessageId(null);
                onReportUser(item.sender_id, item.id);
              }}
              onTogglePlay={() => void onTogglePlayback(item)}
            />
          )}
        />
      )}
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
                  attachmentPreviewText(replyingTo.attachment_type, replyingTo.attachment_name, t) ||
                  ''}
            </Text>
          </View>
          <TouchableOpacity onPress={onCancelReply}>
            <Text style={styles.editingBarCancel}>{t('chat.cancel')}</Text>
          </TouchableOpacity>
        </View>
      )}
      <View
        style={[
          styles.composer,
          {
            paddingBottom: isKeyboardVisible ? spacing.md : insets.bottom + spacing.md,
          },
        ]}
      >
        {isRecording ? (
          <>
            <TouchableOpacity
              onPress={() => void onStopRecording(false)}
              style={styles.attachButton}
            >
              <FontAwesome6 name="trash" iconStyle="solid" size={18} color={colors.danger} />
            </TouchableOpacity>
            <View style={styles.recordingIndicator}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingTime}>{formatDuration(recordingSeconds)}</Text>
            </View>
            <TouchableOpacity
              onPress={() => void onStopRecording(true)}
              style={styles.sendButton}
            >
              <FontAwesome6 name="paper-plane" iconStyle="solid" size={15} color={colors.white} />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              onPress={() => void onPickFile()}
              style={styles.attachButton}
              disabled={isUploadingAttachment}
            >
              <FontAwesome6 name="paperclip" iconStyle="solid" size={18} color={colors.smoke} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => void onPickImage()}
              style={styles.attachButton}
              disabled={isUploadingAttachment}
            >
              {isUploadingAttachment ? (
                <ActivityIndicator size="small" color={colors.smoke} />
              ) : (
                <FontAwesome6 name="camera" iconStyle="solid" size={20} color={colors.smoke} />
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
            {draft.trim() || editingMessageId ? (
              <TouchableOpacity onPress={() => void onSend()} style={styles.sendButton}>
                {editingMessageId ? (
                  <FontAwesome6 name="check" iconStyle="solid" size={16} color={colors.white} />
                ) : (
                  <FontAwesome6
                    name="paper-plane"
                    iconStyle="solid"
                    size={15}
                    color={colors.white}
                  />
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => void onStartRecording()}
                style={styles.sendButton}
                disabled={isUploadingAttachment}
              >
                <FontAwesome6 name="microphone" iconStyle="solid" size={16} color={colors.white} />
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
      {!isKeyboardVisible && <FooterNav active="chats" />}
      </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
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
  headerNameBlock: { flex: 1 },
  callButton: { paddingHorizontal: 4, paddingVertical: 4 },
  headerName: { fontWeight: '700', fontSize: 15, color: colors.ink },
  headerStatus: { fontSize: 11.5, fontWeight: '600', color: colors.sage },
  offlineBanner: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.md,
    backgroundColor: colors.danger,
    alignItems: 'center',
  },
  offlineBannerText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: colors.paper2,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  searchInput: { flex: 1, fontSize: 14.5, color: colors.ink, padding: 0 },
  searchEmptyText: {
    textAlign: 'center',
    color: colors.smoke,
    marginTop: spacing.xxl,
    fontSize: 14,
  },
  searchResultRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  searchResultSender: { fontWeight: '700', fontSize: 13.5, color: colors.ink, marginBottom: 2 },
  searchResultSnippet: { fontSize: 13.5, color: colors.smoke },
  list: { flex: 1, paddingHorizontal: 12 },
  rowMine: { alignItems: 'flex-end', marginVertical: 4 },
  rowTheirs: { alignItems: 'flex-start', marginVertical: 4 },
  bubble: {
    padding: 11,
    paddingHorizontal: 15,
    borderRadius: 22,
  },
  mediaBubble: {
    padding: 4,
    borderRadius: 18,
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
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 200,
  },
  callLogRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  waveform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  waveformBar: {
    width: 2.5,
    borderRadius: 1.5,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: 220,
  },
  fileName: { flex: 1, fontWeight: '600' },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleMine: { backgroundColor: colors.white },
  iconCircleTheirs: { backgroundColor: colors.ember },
  bubblePending: { opacity: 0.55 },
  bubbleHighlighted: { borderWidth: 3, borderColor: colors.sage },
  spinner: { marginTop: spacing.xl },
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
    paddingHorizontal: 2,
    paddingVertical: 2,
    marginBottom: 6,
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
    backgroundColor: colors.paper2,
    borderRadius: radii.xl,
    marginTop: 6,
    shadowColor: colors.ink,
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  pickerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  pickerEmoji: { paddingHorizontal: 6 },
  pickerEmojiText: { fontSize: 22 },
  pickerActionText: { fontSize: 14, color: colors.ember, fontWeight: '600' },
  pickerDeleteText: { color: colors.danger },
  seenAvatar: { marginTop: 4, flexDirection: 'row', gap: 2 },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.smoke,
  },
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
  recordingIndicator: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.danger,
  },
  recordingTime: { fontSize: 14.5, color: colors.ink, fontWeight: '600' },
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
});