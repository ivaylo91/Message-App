import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Linking,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
import type { ViewStyle } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { AppStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import * as conversationsData from '../data/conversations';
import * as reactionsData from '../data/reactions';
import { mergeReactions } from '../utils/reactions';
import * as mediaData from '../data/media';
import * as moderationData from '../data/moderation';
import type { ReportReason } from '../data/moderation';
import { Avatar } from '../components/Avatar';
import { Touchable } from '../components/Touchable';
import { AppWallpaper } from '../components/AppWallpaper';
import { MediaViewer } from '../components/MediaViewer';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { AppLogo } from '../components/AppLogo';
import { FooterNav } from '../components/FooterNav';
import { useToast } from '../components/Toast';
import { useCall } from '../calling/CallContext';
import { useContentWidth } from '../hooks/useContentWidth';
import { usePresence } from '../presence/PresenceContext';
import { useUnread } from '../unread/UnreadContext';
import { useOutbox } from '../offline/OutboxContext';
import { useTyping } from '../typing/TypingContext';
import { OutboxEntry } from '../offline/outboxStorage';
import {
  attachmentPreviewText,
  callStatusPreviewText,
  fileIconName,
  formatDuration,
  formatLastSeen,
  formatMessageDay,
  formatMessageTime,
  messageIdsStartingADay,
} from '../utils/messagePreview';
import { hasLink, linkifyText } from '../utils/linkify';
import { runPositions, showsSenderName, type RunPosition } from '../utils/messageGrouping';
import * as draftStorage from '../drafts/draftStorage';
import {
  elevation,
  fontSizes,
  radii,
  spacing,
  MAX_BUBBLE_WIDTH,
  ThemeColors,
} from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';
import { ConversationParticipant, Message, MessageReaction, ReplyPreview } from '../types';

type Props = NativeStackScreenProps<AppStackParamList, 'Chat'>;

const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];
const REPORT_REASONS: ReportReason[] = [
  'spam',
  'harassment',
  'inappropriate_content',
  'other',
];
const REPORT_REASON_LABEL_KEYS: Record<ReportReason, string> = {
  spam: 'chat.reportReasonSpam',
  harassment: 'chat.reportReasonHarassment',
  inappropriate_content: 'chat.reportReasonInappropriate',
  other: 'chat.reportReasonOther',
};
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_SELECTION = 10;
const SEARCH_DEBOUNCE_MS = 300;
// Roughly a screenful of history before the jump-to-latest button is
// worth offering.
const SCROLL_TO_BOTTOM_THRESHOLD = 400;

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
    <View style={[styles.replyQuote, isMine ? styles.replyQuoteMine : styles.replyQuoteTheirs]}>
      <View style={[styles.replyQuoteBar, isMine ? styles.replyQuoteBarMine : styles.replyQuoteBarTheirs]} />
      <View style={styles.replyQuoteContent}>
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
    // The bubble already knows the shape the photo will take, so the
    // placeholder is that shape rather than a spinner floating inside it.
    return (
      <SkeletonGroup>
        <View style={[styles.media, styles.mediaLoading]} />
      </SkeletonGroup>
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
    <Touchable
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
    </Touchable>
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
    <Touchable
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
    </Touchable>
  );
}

// Reactions used to simply appear, which for something as small and
// incidental as a pill reads as a rendering glitch rather than as
// somebody responding. Springing it in from 0.8 gives the arrival a
// beat. Keyed on the emoji by the caller, so this mounts (and therefore
// animates) only when a *new* emoji appears - a count ticking from 2 to
// 3 leaves the same pill mounted and still.
function ReactionPill({
  summary,
  onPress,
}: {
  summary: ReactionSummary;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const scale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 5,
      tension: 160,
      useNativeDriver: true,
    }).start();
  }, [scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Touchable
        style={[styles.reactionPill, summary.reactedByMe && styles.reactionPillMine]}
        onPress={onPress}
      >
        <Text style={styles.reactionPillText}>
          {summary.emoji} {summary.count > 1 ? summary.count : ''}
        </Text>
      </Touchable>
    </Animated.View>
  );
}

type SeenBy = { name: string; avatarPath: string | null }[];

// Shared empties so a message with no reactions / nobody having seen it
// gets the *same* array every render - `?? []` would mint a new one each
// time and defeat the memo comparison below.
const NO_REACTIONS: MessageReaction[] = [];
const NO_SEEN_BY: SeenBy = [];

// Every handler takes the message (or its id) rather than being a closure
// bound to one, so the parent can hand down callbacks that keep the same
// identity across renders. Binding happens inside the memoized component
// instead, where a fresh closure per render costs nothing.
interface MessageBubbleProps {
  message: LocalMessage;
  isMine: boolean;
  senderName: string | null;
  reactions: MessageReaction[];
  userId: string | null;
  isPickerOpen: boolean;
  isHighlighted: boolean;
  seenBy: SeenBy;
  bubbleMaxWidth: number;
  isPlaying: boolean;
  // Set only on a message that opens a new calendar day, so it renders
  // a divider above itself. A string rather than a date, so it stays
  // comparable by value and the memo below still holds.
  dayLabel: string | null;
  onLongPress: (messageId: string) => void;
  onDismissPicker: () => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onEdit: (message: LocalMessage) => void;
  onDelete: (messageId: string) => void;
  onReply: (message: LocalMessage) => void;
  onReport: (message: LocalMessage) => void;
  onTogglePlay: (message: LocalMessage) => void;
  onOpenImage: (path: string) => void;
  runPosition: RunPosition;
}

function MessageBubbleComponent({
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
  dayLabel,
  onLongPress,
  onDismissPicker,
  onToggleReaction,
  onEdit,
  onDelete,
  onReply,
  onReport,
  onTogglePlay,
  onOpenImage,
  runPosition,
}: MessageBubbleProps) {
  const { t, i18n } = useTranslation();
  const { colors, gradients } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const summary = useMemo(
    () => summarizeReactions(reactions, userId),
    [reactions, userId],
  );

  // Flatten the corner facing a neighbour in the same run, on the sender's
  // own side - which is what turns a stack of identical rounded islands
  // into something that reads as one person talking.
  const runShape = useMemo<ViewStyle>(() => {
    const joined = radii.sm;
    const top = runPosition === 'middle' || runPosition === 'last';
    const bottom = runPosition === 'middle' || runPosition === 'first';
    return {
      ...(top
        ? isMine
          ? { borderTopRightRadius: joined }
          : { borderTopLeftRadius: joined }
        : null),
      ...(bottom
        ? isMine
          ? { borderBottomRightRadius: joined }
          : { borderBottomLeftRadius: joined }
        : null),
    };
  }, [runPosition, isMine]);

  return (
    <>
      {dayLabel && (
        <View style={styles.dayDivider}>
          <Text style={styles.dayDividerText}>{dayLabel}</Text>
        </View>
      )}
      <View style={isMine ? styles.rowMine : styles.rowTheirs}>
      {senderName && showsSenderName(runPosition) && (
        <Text style={styles.senderLabel}>{senderName}</Text>
      )}
      <Touchable
        onLongPress={() => onLongPress(message.id)}
        onPress={onDismissPicker}
      >
        <LinearGradient
          colors={isMine ? [...gradients.mine] : [...gradients.theirs]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            message.attachment_type === 'image' ? styles.mediaBubble : styles.bubble,
            { maxWidth: bubbleMaxWidth },
            runShape,
            message._pending && styles.bubblePending,
            isHighlighted && styles.bubbleHighlighted,
          ]}
        >
          {message.reply_to && (
            <ReplyQuote reply={message.reply_to} userId={userId} isMine={isMine} />
          )}
          {message.call_status && <CallLogRow message={message} isMine={isMine} />}
          {message.attachment_type === 'image' && message.media_path && (
            <Touchable
              // Long-press still has to reach the bubble's own handler,
              // or photos would be the one message type you can't react
              // to, reply to or delete.
              onPress={() => onOpenImage(message.media_path as string)}
              onLongPress={() => onLongPress(message.id)}
              disabled={message._pending}
              accessibilityRole="imagebutton"
              accessibilityLabel={t('chat.a11yOpenPhoto')}
            >
              <MediaImage path={message.media_path} />
            </Touchable>
          )}
          {message.attachment_type === 'audio' && (
            <AudioMessageBubble
              message={message}
              isMine={isMine}
              isPlaying={isPlaying}
              onTogglePlay={() => onTogglePlay(message)}
            />
          )}
          {message.attachment_type === 'file' && (
            <FileMessageBubble message={message} isMine={isMine} />
          )}
          {message.body && (
            <Text style={isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs}>
              {hasLink(message.body)
                ? linkifyText(message.body).map((segment, i) =>
                    segment.url ? (
                      <Text
                        key={i}
                        style={styles.linkText}
                        onPress={() => {
                          const url = segment.url;
                          if (url) void Linking.openURL(url).catch(() => {});
                        }}
                      >
                        {segment.text}
                      </Text>
                    ) : (
                      segment.text
                    ),
                  )
                : message.body}
            </Text>
          )}
          <View style={styles.metaRow}>
            {message.edited_at && (
              <Text style={isMine ? styles.metaTextMine : styles.metaTextTheirs}>
                {t('chat.edited')}
              </Text>
            )}
            <Text style={isMine ? styles.metaTextMine : styles.metaTextTheirs}>
              {formatMessageTime(message.created_at, i18n.language)}
            </Text>
          </View>
        </LinearGradient>
      </Touchable>

      {summary.length > 0 && (
        <View style={styles.reactionRow}>
          {summary.map((r) => (
            <ReactionPill
              key={r.emoji}
              summary={r}
              onPress={() => onToggleReaction(message.id, r.emoji)}
            />
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
            <Touchable
              key={emoji}
              onPress={() => onToggleReaction(message.id, emoji)}
              style={styles.pickerEmoji}
            >
              <Text style={styles.pickerEmojiText}>{emoji}</Text>
            </Touchable>
          ))}
          {!message._pending && (
            <Touchable onPress={() => onReply(message)} style={styles.pickerEmoji}>
              <Text style={styles.pickerActionText}>{t('chat.reply')}</Text>
            </Touchable>
          )}
          {isMine && message.body && (
            <Touchable onPress={() => onEdit(message)} style={styles.pickerEmoji}>
              <Text style={styles.pickerActionText}>{t('chat.edit')}</Text>
            </Touchable>
          )}
          {isMine && (
            <Touchable onPress={() => onDelete(message.id)} style={styles.pickerEmoji}>
              <Text style={[styles.pickerActionText, styles.pickerDeleteText]}>
                {t('chat.delete')}
              </Text>
            </Touchable>
          )}
          {!isMine && !message._pending && (
            <Touchable onPress={() => onReport(message)} style={styles.pickerEmoji}>
              <Text style={[styles.pickerActionText, styles.pickerDeleteText]}>
                {t('chat.reportTitle')}
              </Text>
            </Touchable>
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
    </>
  );
}

// Typing in the composer updates ChatScreen's `draft` state, which
// re-runs its render - and with it renderItem for every row the list has
// mounted. Without this memo each keystroke re-rendered every bubble,
// re-deriving its styles, its reaction summary and (for voice messages)
// its waveform. The props above are all primitives or memoized
// references, so the shallow compare here holds and a keystroke now stops
// at the list instead of reaching into ~50 subtrees.
const MessageBubble = memo(MessageBubbleComponent);

// Module scope so the FlatList gets the same function every render.
const messageKeyExtractor = (item: LocalMessage) => item.id;

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

// Alternating sides at varied widths, so the wait looks like a
// conversation arriving rather than a loading bar. Opening a chat used to
// show a blank area until the first page resolved.
const SKELETON_BUBBLES: { mine: boolean; width: number }[] = [
  { mine: false, width: 0.62 },
  { mine: true, width: 0.45 },
  { mine: false, width: 0.78 },
  { mine: true, width: 0.55 },
  { mine: false, width: 0.4 },
  { mine: true, width: 0.7 },
];

function ChatHistorySkeleton({ bubbleMaxWidth }: { bubbleMaxWidth: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <SkeletonGroup style={styles.historySkeleton}>
      {SKELETON_BUBBLES.map((bubble, i) => (
        <View key={i} style={bubble.mine ? styles.rowMine : styles.rowTheirs}>
          <Skeleton
            width={Math.round(bubbleMaxWidth * bubble.width)}
            height={bubble.mine ? 38 : 48}
            radius={radii.bubble}
          />
        </View>
      ))}
    </SkeletonGroup>
  );
}

export function ChatScreen({ route, navigation }: Props) {
  const { t, i18n } = useTranslation();
  const { conversationId, title } = route.params;
  const { userId } = useAuth();
  const { showToast } = useToast();
  const { isOnline } = usePresence();
  const { markConversationRead } = useUnread();
  const outbox = useOutbox();
  const { typingConversationIds, watch: watchTyping, sendTyping } = useTyping();
  const { startCall } = useCall();
  const insets = useSafeAreaInsets();
  const { windowWidth, contentWidth } = useContentWidth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const bubbleMaxWidth = Math.min(windowWidth * 0.8, MAX_BUBBLE_WIDTH);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [isLoadingMoreMessages, setIsLoadingMoreMessages] = useState(false);
  const [didLoadFail, setDidLoadFail] = useState(false);
  const [hasLoadedMessages, setHasLoadedMessages] = useState(false);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [viewerPath, setViewerPath] = useState<string | null>(null);
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
  const [reportTarget, setReportTarget] = useState<{
    userId: string;
    messageId?: string;
  } | null>(null);

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

  // Mirrors `reactions` for onToggleReaction to read - see there for why
  // it can't just depend on the state directly.
  const reactionsRef = useRef<MessageReaction[]>([]);
  reactionsRef.current = reactions;

  useEffect(() => {
    void conversationsData
      .fetchConversation(conversationId)
      .then((conversation) => {
        setParticipants(conversation.conversation_participants);
        setIsGroup(conversation.is_group);
      })
      .catch(() => {
        // Non-fatal on its own: the header falls back to the title
        // passed in through route params, and the message list surfaces
        // its own failure below. Swallowed rather than reported twice.
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
            )?.profiles ?? { id: replied.sender_id, email: '', display_name: '', avatar_path: null, username: null, phone: null, last_seen_at: null };
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

  // Split out of the focus effect so the retry button can call it too.
  const loadMessages = useCallback(async () => {
    setHasMoreMessages(true);
    setDidLoadFail(false);
    try {
      const fetched = await conversationsData.fetchMessages(conversationId);
      setMessages(fetched);
      setHasMoreMessages(fetched.length === conversationsData.MESSAGE_PAGE_SIZE);
      // Chained rather than fired alongside: which reactions to ask
      // for is decided by which messages came back.
      setReactions(
        await reactionsData.fetchReactionsForMessages(fetched.map((m) => m.id)),
      );
      setHasLoadedMessages(true);
    } catch {
      // Previously this rejection went nowhere, which left an empty
      // message list behind a composer that looked perfectly functional
      // - the worst version of offline, since the app has an outbox and
      // will happily accept messages it can't show you the history of.
      setDidLoadFail(true);
      setHasLoadedMessages(true);
    }
  }, [conversationId]);

  useFocusEffect(
    useCallback(() => {
      void loadMessages();
      markRead();
    }, [loadMessages, markRead]),
  );

  // Inverted FlatList's onEndReached fires when the user scrolls up to
  // the oldest end of what's currently loaded - fetch the next page
  // before it and append (messages is newest-first, so older history
  // goes at the end of the array).
  const loadMoreMessages = useCallback(async () => {
    if (isLoadingMoreMessages || !hasMoreMessages || messages.length === 0) return;
    setIsLoadingMoreMessages(true);
    try {
      const oldest = messages[messages.length - 1];
      const older = await conversationsData.fetchMessages(conversationId, oldest.created_at);
      setMessages((current) => [...current, ...older]);
      if (older.length < conversationsData.MESSAGE_PAGE_SIZE) setHasMoreMessages(false);
      const olderReactions = await reactionsData.fetchReactionsForMessages(
        older.map((m) => m.id),
      );
      setReactions((current) => mergeReactions(current, olderReactions));
    } catch {
      // Non-fatal - what's already loaded stays usable, so this is a
      // toast rather than taking over the screen. hasMoreMessages is
      // deliberately left alone so scrolling up can try again.
      showToast(t('chat.loadMoreFailedToast'));
    } finally {
      setIsLoadingMoreMessages(false);
    }
  }, [conversationId, hasMoreMessages, isLoadingMoreMessages, messages, showToast, t]);

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
    //
    // This screen is now the only thing that ever opens this topic -
    // ConversationsScreen used to open it too for typing indicators,
    // which meant the removal below was routinely tearing down the
    // list's live subscription rather than clearing a leftover of our
    // own. Typing has since moved to its own topic (TypingContext.tsx),
    // so this is back to guarding only against this effect racing
    // itself.
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
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [conversationId, upsertMessage]);

  // Typing broadcasts live on their own topic, owned by TypingProvider,
  // so that ConversationsScreen can listen for the same conversation at
  // the same time - see TypingContext.tsx for why sharing this screen's
  // channel for it was actively harmful.
  useEffect(() => watchTyping([conversationId]), [watchTyping, conversationId]);

  const otherTyping = typingConversationIds.has(conversationId);

  // Restore whatever was left unsent here. Guarded on the id the load
  // was started for, so switching conversations quickly can't drop an
  // older conversation's draft into a newer one.
  useEffect(() => {
    let cancelled = false;
    void draftStorage.loadDraft(conversationId).then((saved) => {
      if (cancelled || !saved) return;
      // Never clobber something already being typed or edited.
      setDraft((current) => (current.length > 0 ? current : saved));
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const onChangeDraft = (text: string) => {
    setDraft(text);
    sendTyping(conversationId);
    // Not debounced: AsyncStorage writes are async and off the JS
    // critical path, and a debounce risks losing the last keystrokes to
    // a backgrounded app - the exact case this exists for. Editing an
    // existing message is excluded: that text belongs to the message,
    // not to a draft, and persisting it would resurrect it as one.
    if (!editingMessageId) void draftStorage.saveDraft(conversationId, text);
  };

  const onSend = async () => {
    const body = draft.trim();
    if (!body || !userId) return;
    setDraft('');

    if (editingMessageId) {
      const messageId = editingMessageId;
      setEditingMessageId(null);
      try {
        const updated = await conversationsData.editMessage(messageId, body);
        setMessages((current) =>
          current.map((m) => (m.id === updated.id ? updated : m)),
        );
      } catch {
        // The composer held the only copy of what was typed, and it was
        // cleared before the request went out - so put the user back
        // exactly where they were instead of dropping the edit silently.
        // Unlike a send, an edit doesn't go through the outbox, so
        // there's nothing else retrying on its behalf.
        setEditingMessageId(messageId);
        setDraft(body);
        Alert.alert(t('chat.editFailedTitle'), t('chat.editFailedMessage'));
      }
      return;
    }

    const replyToMessageId = replyingTo?.id ?? null;
    const replyToPreview = replyingTo;
    setReplyingTo(null);

    // Queued rather than sent directly - the outbox shows it immediately
    // (dimmed, via displayMessages) and takes care of retrying if this
    // fails or the device is offline, instead of the send just erroring
    // out. See OutboxContext for the retry/persistence behavior.
    void draftStorage.clearDraft(conversationId);

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

  const onTogglePlayback = useCallback(async (message: LocalMessage) => {
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
  }, [playingMessageId]);

  const onToggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!userId) return;
      setPickerMessageId(null);
      // Read through the ref rather than depending on `reactions`
      // directly: that dependency gave this callback a new identity on
      // every incoming reaction, which changed a prop on every bubble
      // and made the memo below miss for the whole list. Same pattern as
      // participantsRef above.
      const alreadyReacted = reactionsRef.current.some(
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
    [conversationId, userId],
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
      )?.profiles ?? { id: message.sender_id, email: '', display_name: '', avatar_path: null, username: null, phone: null, last_seen_at: null };
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
        try {
          const around = await conversationsData.fetchMessagesAround(conversationId, result.id);
          setMessages(around);
          // This replaces the loaded window wholesale rather than
          // extending it, so the reactions it carries are replaced too.
          setReactions(
            await reactionsData.fetchReactionsForMessages(around.map((m) => m.id)),
          );
        } catch {
          // Leave the existing window alone and say so, rather than
          // closing search and appearing to do nothing.
          showToast(t('chat.jumpToMessageFailedToast'));
          return;
        }
      }
      setHighlightedMessageId(result.id);
    },
    [conversationId, messages, onCloseSearch, showToast, t],
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

  // Deliberately a modal and not an Alert. React Native's Android Alert
  // does buttons.slice(0, 3) - "At most three buttons (neutral,
  // negative, positive). Ignore rest." - and this needs four reasons
  // plus a cancel. On Android the old Alert silently dropped "Other"
  // and Cancel, and reordered the three that survived, leaving no way
  // out of the dialog except the hardware back button.
  const onReportUser = useCallback((reportedUserId: string, messageId?: string) => {
    setReportTarget({ userId: reportedUserId, messageId });
  }, []);

  const onSubmitReport = useCallback(
    (reason: ReportReason) => {
      if (!userId || !reportTarget) return;
      const target = reportTarget;
      setReportTarget(null);
      void moderationData
        .reportUser(userId, target.userId, reason, { messageId: target.messageId })
        .then(() => showToast(t('chat.reportSuccessToast')))
        .catch(() => Alert.alert(t('chat.reportFailedTitle'), t('chat.reportFailedMessage')));
    },
    [userId, reportTarget, showToast, t],
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

  // Bucketed once per reactions change instead of scanning the whole
  // reaction list inside renderItem for every row - that was O(messages x
  // reactions) per render, and handed each bubble a freshly-filtered array
  // that no memo could ever match.
  const reactionsByMessageId = useMemo(() => {
    const map = new Map<string, MessageReaction[]>();
    for (const reaction of reactions) {
      const existing = map.get(reaction.message_id);
      if (existing) existing.push(reaction);
      else map.set(reaction.message_id, [reaction]);
    }
    return map;
  }, [reactions]);

  // displayMessages is newest-first, so the message *above* index i on
  // screen is i+1. A message opens a new day when the one before it in
  // reading order sits on a different calendar day - and the very oldest
  // loaded message always opens one, so history never starts mid-day
  // with no header.
  const dayLabelsByMessageId = useMemo(() => {
    const startsADay = messageIdsStartingADay(displayMessages);
    const labels = new Map<string, string>();
    for (const message of displayMessages) {
      if (startsADay.has(message.id)) {
        labels.set(message.id, formatMessageDay(message.created_at, t, i18n.language));
      }
    }
    return labels;
  }, [displayMessages, t, i18n.language]);

  const onTogglePicker = useCallback((messageId: string) => {
    setPickerMessageId((current) => (current === messageId ? null : messageId));
  }, []);

  const onDismissPicker = useCallback(() => setPickerMessageId(null), []);

  const onReportMessage = useCallback(
    (message: LocalMessage) => {
      setPickerMessageId(null);
      onReportUser(message.sender_id, message.id);
    },
    [onReportUser],
  );

  const onToggleReactionForMessage = useCallback(
    (messageId: string, emoji: string) => void onToggleReaction(messageId, emoji),
    [onToggleReaction],
  );

  const onTogglePlay = useCallback(
    (message: LocalMessage) => void onTogglePlayback(message),
    [onTogglePlayback],
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

  // The list is inverted, so offset 0 is the newest message at the
  // bottom - scrolling "up" through history moves the offset up.
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIsScrolledUp(event.nativeEvent.contentOffset.y > SCROLL_TO_BOTTOM_THRESHOLD);
  }, []);

  // Oldest-first, so paging left-to-right in the viewer runs in the
  // same direction as scrolling down through the conversation. Limited
  // to the loaded window, which is the same history the chat itself is
  // showing.
  const imagePaths = useMemo(
    () =>
      displayMessages
        .filter((m) => m.attachment_type === 'image' && m.media_path)
        .map((m) => m.media_path as string)
        .reverse(),
    [displayMessages],
  );

  const onOpenImage = useCallback((path: string) => setViewerPath(path), []);

  const runPositionByMessageId = useMemo(
    () => runPositions(displayMessages),
    [displayMessages],
  );

  const onJumpToLatest = useCallback(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const renderMessage = useCallback(
    ({ item }: { item: LocalMessage }) => (
      <MessageBubble
        message={item}
        isMine={item.sender_id === userId}
        senderName={
          isGroup && item.sender_id !== userId
            ? senderNames.get(item.sender_id) ?? null
            : null
        }
        reactions={reactionsByMessageId.get(item.id) ?? NO_REACTIONS}
        userId={userId}
        isPickerOpen={pickerMessageId === item.id}
        isHighlighted={item.id === highlightedMessageId}
        bubbleMaxWidth={bubbleMaxWidth}
        isPlaying={playingMessageId === item.id}
        seenBy={seenAvatarsByMessageId.get(item.id) ?? NO_SEEN_BY}
        dayLabel={dayLabelsByMessageId.get(item.id) ?? null}
        onLongPress={onTogglePicker}
        onDismissPicker={onDismissPicker}
        onToggleReaction={onToggleReactionForMessage}
        onEdit={onEditMessage}
        onDelete={onDeleteMessage}
        onReply={onReplyToMessage}
        onReport={onReportMessage}
        onTogglePlay={onTogglePlay}
        onOpenImage={onOpenImage}
        runPosition={runPositionByMessageId.get(item.id) ?? 'single'}
      />
    ),
    [
      userId,
      isGroup,
      senderNames,
      reactionsByMessageId,
      pickerMessageId,
      highlightedMessageId,
      bubbleMaxWidth,
      playingMessageId,
      seenAvatarsByMessageId,
      dayLabelsByMessageId,
      onTogglePicker,
      onDismissPicker,
      onToggleReactionForMessage,
      onEditMessage,
      onDeleteMessage,
      onReplyToMessage,
      onReportMessage,
      onTogglePlay,
      onOpenImage,
      runPositionByMessageId,
    ],
  );

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
        <Touchable
          style={styles.backButton}
          iconButton
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('chat.a11yBack')}
        >
          <FontAwesome6 name="chevron-left" iconStyle="solid" size={18} color={colors.ink} />
        </Touchable>
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
          {!otherTyping && !isGroup && otherParticipant && (
            isOnline(otherParticipant.user_id) ? (
              <Text style={styles.headerStatus}>{t('chat.online')}</Text>
            ) : (
              <Text style={styles.headerStatusOffline}>
                {formatLastSeen(otherParticipant.profiles.last_seen_at, t)}
              </Text>
            )
          )}
        </View>
        <Touchable
          style={styles.callButton}
          iconButton
          onPress={() => setIsSearchOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('chat.a11ySearch')}
        >
          <FontAwesome6 name="magnifying-glass" iconStyle="solid" size={16} color={colors.ink} />
        </Touchable>
        <Touchable
          style={styles.callButton}
          iconButton
          onPress={() => navigation.navigate('MediaGallery', { conversationId, title: displayTitle })}
          accessibilityRole="button"
          accessibilityLabel={t('chat.a11yGallery')}
        >
          <FontAwesome6 name="images" iconStyle="solid" size={16} color={colors.ink} />
        </Touchable>
        {isGroup && (
          <Touchable
            style={styles.callButton}
            iconButton
            onPress={() => navigation.navigate('GroupInfo', { conversationId })}
            accessibilityRole="button"
            accessibilityLabel={t('chat.a11yGroupInfo')}
          >
            <FontAwesome6 name="users" iconStyle="solid" size={16} color={colors.ink} />
          </Touchable>
        )}
        {!isGroup && otherParticipant && (
          <Touchable
            style={styles.callButton}
            iconButton
            onPress={() =>
              void startCall({
                conversationId,
                peerUserId: otherParticipant.user_id,
                peerName: displayTitle,
                peerAvatarPath: otherParticipant.profiles.avatar_path,
              })
            }
            accessibilityRole="button"
            accessibilityLabel={t('chat.a11yCall')}
          >
            <FontAwesome6 name="video" iconStyle="solid" size={17} color={colors.ember} />
          </Touchable>
        )}
        {!isGroup && otherParticipant && (
          <Touchable
            style={styles.callButton}
            iconButton
            onPress={onOpenChatMenu}
            accessibilityRole="button"
            accessibilityLabel={t('chat.a11yMenu')}
          >
            <FontAwesome6 name="ellipsis-vertical" iconStyle="solid" size={16} color={colors.ink} />
          </Touchable>
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
          <Touchable
            onPress={onCloseSearch}
            accessibilityRole="button"
            accessibilityLabel={t('chat.a11yCloseSearch')}
          >
            <FontAwesome6 name="xmark" iconStyle="solid" size={16} color={colors.smoke} />
          </Touchable>
        </View>
      )}

      {!hasLoadedMessages && displayMessages.length === 0 ? (
        <ChatHistorySkeleton bubbleMaxWidth={bubbleMaxWidth} />
      ) : didLoadFail && displayMessages.length === 0 ? (
        <View style={styles.loadError}>
          <FontAwesome6
            name="cloud-arrow-down"
            iconStyle="solid"
            size={26}
            color={colors.smoke}
          />
          <Text style={styles.loadErrorTitle}>{t('chat.loadFailedTitle')}</Text>
          <Text style={styles.loadErrorHint}>{t('chat.loadFailedMessage')}</Text>
          <Touchable style={styles.loadErrorButton} onPress={() => void loadMessages()}>
            <Text style={styles.loadErrorButtonText}>{t('chat.loadFailedRetry')}</Text>
          </Touchable>
        </View>
      ) : isSearchOpen ? (
        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          {isSearching && <ActivityIndicator color={colors.ember} style={styles.spinner} />}
          {!isSearching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
            <Text style={styles.searchEmptyText}>{t('chat.noSearchResults')}</Text>
          )}
          {searchResults.map((result) => (
            <Touchable
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
            </Touchable>
          ))}
        </ScrollView>
      ) : (
        <FlatList
          ref={flatListRef}
          style={styles.list}
          data={displayMessages}
          keyExtractor={messageKeyExtractor}
          inverted
          ListHeaderComponent={otherTyping ? TypingBubble : null}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onEndReached={() => void loadMoreMessages()}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            isLoadingMoreMessages ? (
              <ActivityIndicator style={styles.historyLoading} color={colors.smoke} />
            ) : null
          }
          onScrollToIndexFailed={(info) => {
            setTimeout(
              () => flatListRef.current?.scrollToIndex({ index: info.index, animated: true }),
              100,
            );
          }}
          renderItem={renderMessage}
        />
      )}
      {isScrolledUp && !isSearchOpen && (
        <Touchable
          style={styles.jumpToLatest}
          iconButton
          onPress={onJumpToLatest}
          accessibilityRole="button"
          accessibilityLabel={t('chat.jumpToLatest')}
        >
          <FontAwesome6 name="chevron-down" iconStyle="solid" size={14} color={colors.ink} />
        </Touchable>
      )}
      {editingMessageId && (
        <View style={styles.editingBar}>
          <Text style={styles.editingBarText}>{t('chat.editingMessage')}</Text>
          <Touchable onPress={onCancelEdit}>
            <Text style={styles.editingBarCancel}>{t('chat.cancel')}</Text>
          </Touchable>
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
          <Touchable onPress={onCancelReply}>
            <Text style={styles.editingBarCancel}>{t('chat.cancel')}</Text>
          </Touchable>
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
            <Touchable
              onPress={() => void onStopRecording(false)}
              style={styles.attachButton}
              iconButton
              accessibilityRole="button"
              accessibilityLabel={t('chat.a11yDiscardRecording')}
            >
              <FontAwesome6 name="trash" iconStyle="solid" size={18} color={colors.danger} />
            </Touchable>
            <View style={styles.recordingIndicator}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingTime}>{formatDuration(recordingSeconds)}</Text>
            </View>
            <Touchable
              onPress={() => void onStopRecording(true)}
              style={styles.sendButton}
              iconButton
              accessibilityRole="button"
              accessibilityLabel={t('chat.a11ySendRecording')}
            >
              <FontAwesome6 name="paper-plane" iconStyle="solid" size={15} color={colors.white} />
            </Touchable>
          </>
        ) : (
          <>
            <Touchable
              onPress={() => void onPickFile()}
              style={styles.attachButton}
              iconButton
              disabled={isUploadingAttachment}
              accessibilityRole="button"
              accessibilityLabel={t('chat.a11yAttachFile')}
            >
              <FontAwesome6 name="paperclip" iconStyle="solid" size={18} color={colors.smoke} />
            </Touchable>
            <Touchable
              onPress={() => void onPickImage()}
              style={styles.attachButton}
              iconButton
              disabled={isUploadingAttachment}
              accessibilityRole="button"
              accessibilityLabel={t('chat.a11yAttachPhoto')}
            >
              {isUploadingAttachment ? (
                <ActivityIndicator size="small" color={colors.smoke} />
              ) : (
                <FontAwesome6 name="camera" iconStyle="solid" size={20} color={colors.smoke} />
              )}
            </Touchable>
            <TextInput
              style={styles.input}
              placeholder={t('chat.messagePlaceholder')}
              placeholderTextColor={colors.smoke}
              value={draft}
              onChangeText={onChangeDraft}
              // Grows with the message instead of scrolling a long one
              // sideways through a single line. Return now inserts a
              // newline, so sending is the button's job - which is why
              // onSubmitEditing is gone rather than merely inert.
              multiline
              textAlignVertical="center"
            />
            {draft.trim() || editingMessageId ? (
              <Touchable
                onPress={() => void onSend()}
                style={styles.sendButton}
                iconButton
                accessibilityRole="button"
                accessibilityLabel={t('chat.a11ySend')}
              >
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
              </Touchable>
            ) : (
              <Touchable
                onPress={() => void onStartRecording()}
                style={styles.sendButton}
                iconButton
                disabled={isUploadingAttachment}
                accessibilityRole="button"
                accessibilityLabel={t('chat.a11yRecord')}
              >
                <FontAwesome6 name="microphone" iconStyle="solid" size={16} color={colors.white} />
              </Touchable>
            )}
          </>
        )}
      </View>
      {!isKeyboardVisible && <FooterNav active="chats" />}

      <MediaViewer
        paths={imagePaths}
        initialPath={viewerPath}
        onClose={() => setViewerPath(null)}
      />

      <Modal
        visible={reportTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setReportTarget(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('chat.reportTitle')}</Text>
            <Text style={styles.modalMessage}>{t('chat.reportMessage')}</Text>
            {REPORT_REASONS.map((reason) => (
              <Touchable
                key={reason}
                style={styles.reportReason}
                onPress={() => onSubmitReport(reason)}
                accessibilityRole="button"
              >
                <Text style={styles.reportReasonText}>{t(REPORT_REASON_LABEL_KEYS[reason])}</Text>
              </Touchable>
            ))}
            <Touchable
              style={styles.reportCancel}
              onPress={() => setReportTarget(null)}
              accessibilityRole="button"
            >
              <Text style={styles.reportCancelText}>{t('chat.cancel')}</Text>
            </Touchable>
          </View>
        </View>
      </Modal>
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
  headerName: { fontWeight: '700', fontSize: fontSizes.body, color: colors.ink },
  headerStatus: { fontSize: fontSizes.caption, fontWeight: '600', color: colors.sage },
  headerStatusOffline: { fontSize: fontSizes.caption, fontWeight: '600', color: colors.smoke },
  offlineBanner: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.md,
    backgroundColor: colors.danger,
    alignItems: 'center',
  },
  offlineBannerText: { color: colors.white, fontSize: fontSizes.caption, fontWeight: '700' },
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
  searchInput: { flex: 1, fontSize: fontSizes.body, color: colors.ink, padding: 0 },
  searchEmptyText: {
    textAlign: 'center',
    color: colors.smoke,
    marginTop: spacing.xxl,
    fontSize: fontSizes.body,
  },
  searchResultRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  searchResultSender: { fontWeight: '700', fontSize: fontSizes.footnote, color: colors.ink, marginBottom: 2 },
  searchResultSnippet: { fontSize: fontSizes.footnote, color: colors.smoke },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.lg,
    ...elevation.lg,
  },
  modalTitle: { fontSize: fontSizes.bodyLg, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  modalMessage: { fontSize: fontSizes.footnote, color: colors.smoke, marginBottom: spacing.md },
  reportReason: {
    paddingVertical: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  reportReasonText: { fontSize: fontSizes.body, color: colors.ink },
  reportCancel: {
    marginTop: spacing.md,
    paddingVertical: 11,
    borderRadius: radii.pill,
    backgroundColor: colors.paper2,
    alignItems: 'center',
  },
  reportCancelText: { fontSize: fontSizes.body, fontWeight: '700', color: colors.smoke },
  loadError: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xxl,
  },
  loadErrorTitle: { color: colors.ink, fontWeight: '700', fontSize: fontSizes.body },
  loadErrorHint: { color: colors.smoke, fontSize: fontSizes.footnote, textAlign: 'center' },
  loadErrorButton: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
    borderRadius: radii.pill,
    backgroundColor: colors.ember,
  },
  loadErrorButtonText: { color: colors.white, fontWeight: '700', fontSize: fontSizes.body },
  list: { flex: 1, paddingHorizontal: 12 },
  rowMine: { alignItems: 'flex-end', marginVertical: 4 },
  // Messages inside a run sit closer together than separate remarks do.
  rowJoined: { marginTop: 2 },
  historySkeleton: { flex: 1, justifyContent: 'flex-end', padding: spacing.md },
  rowTheirs: { alignItems: 'flex-start', marginVertical: 4 },
  bubble: {
    padding: 11,
    paddingHorizontal: 15,
    borderRadius: radii.bubble,
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
  historyLoading: { marginVertical: spacing.md },
  senderLabel: {
    fontSize: fontSizes.caption,
    fontWeight: '700',
    color: colors.smoke,
    marginBottom: 2,
    marginLeft: 4,
  },
  bubbleTextMine: { color: colors.white, fontSize: fontSizes.body, lineHeight: 20 },
  bubbleTextTheirs: { color: colors.ink, fontSize: fontSizes.body, lineHeight: 20 },
  editedTag: { fontSize: fontSizes.micro, color: colors.smoke, marginTop: 2 },
  linkText: { textDecorationLine: 'underline' },
  jumpToLatest: {
    position: 'absolute',
    right: spacing.lg,
    bottom: 88,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.paper2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: spacing.xs,
    marginTop: 2,
  },
  metaTextMine: { fontSize: fontSizes.micro, color: colors.white, opacity: 0.75 },
  metaTextTheirs: { fontSize: fontSizes.micro, color: colors.smoke },
  dayDivider: { alignItems: 'center', marginVertical: spacing.md },
  dayDividerText: {
    fontSize: fontSizes.caption,
    fontWeight: '700',
    color: colors.smoke,
    backgroundColor: colors.paper2,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  replyQuote: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 7,
    paddingVertical: 5,
    paddingRight: 8,
    marginBottom: 6,
    borderRadius: 8,
    overflow: 'hidden',
  },
  replyQuoteMine: { backgroundColor: 'rgba(255, 255, 255, 0.16)' },
  replyQuoteTheirs: { backgroundColor: colors.line },
  replyQuoteBar: { width: 3, borderRadius: 2 },
  replyQuoteBarMine: { backgroundColor: 'rgba(255, 255, 255, 0.7)' },
  replyQuoteBarTheirs: { backgroundColor: colors.ember },
  // Deliberately not flex:1 - this sits in a shrink-to-fit bubble (sized
  // to its widest content, capped by bubbleMaxWidth), and a flex:1 child
  // of a row whose own container isn't already a resolved width collapses
  // to ~0 rather than sharing the row's space, which was truncating the
  // quoted snippet down to just an ellipsis. Letting it size naturally
  // (like bubbleTextMine/Theirs below already do) lets the outer
  // maxWidth cap do the truncating only when actually necessary.
  replyQuoteContent: {},
  replyQuoteSenderMine: { fontSize: fontSizes.caption, fontWeight: '700', color: colors.white },
  replyQuoteSenderTheirs: { fontSize: fontSizes.caption, fontWeight: '700', color: colors.ember },
  replyQuoteTextMine: { fontSize: fontSizes.caption, color: 'rgba(255, 255, 255, 0.85)' },
  replyQuoteTextTheirs: { fontSize: fontSizes.caption, color: colors.smoke },
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
  reactionPillText: { fontSize: fontSizes.footnote },
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
  pickerEmojiText: { fontSize: fontSizes.title },
  pickerActionText: { fontSize: fontSizes.body, color: colors.ember, fontWeight: '600' },
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
  editingBarText: { fontSize: fontSizes.caption, color: colors.smoke },
  editingBarCancel: { fontSize: fontSizes.caption, color: colors.ember, fontWeight: '600' },
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
  replyBarLabel: { fontSize: fontSizes.caption, fontWeight: '700', color: colors.ember },
  replyBarSnippet: { fontSize: fontSizes.caption, color: colors.smoke, marginTop: 1 },
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
  recordingTime: { fontSize: fontSizes.body, color: colors.ink, fontWeight: '600' },
  input: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: colors.paper2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    marginRight: spacing.sm,
    color: colors.ink,
    fontSize: fontSizes.body,
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