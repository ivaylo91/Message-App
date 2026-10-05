import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, Linking, Text, View } from 'react-native';
import FastImage from '@d11/react-native-fast-image';
import LinearGradient from 'react-native-linear-gradient';
import { FontAwesome6 } from '@react-native-vector-icons/fontawesome6/static';
import { useTranslation } from 'react-i18next';
import type { ViewStyle } from 'react-native';
import * as mediaData from '../../data/media';
import { Avatar } from '../../components/Avatar';
import { Touchable } from '../../components/Touchable';
import { SkeletonGroup } from '../../components/Skeleton';
import {
  attachmentPreviewText,
  callStatusPreviewText,
  fileIconName,
  formatDuration,
  formatMessageTime,
} from '../../utils/messagePreview';
import { SwipeToReply } from '../../components/SwipeToReply';
import { splitMentions } from '../../utils/mentions';
import { hasLink, linkifyText } from '../../utils/linkify';
import { showsSenderName, type RunPosition } from '../../utils/messageGrouping';
import { radii } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeContext';
import { MessageReaction, ReplyPreview } from '../../types';
import {
  fetchLinkPreview,
  linkPreviewImageSource,
  type LinkPreview,
} from '../../data/linkPreviews';
import { makeStyles } from './chatStyles';
import { LocalMessage, MessageStatus, STATUS_ICONS, type PlaybackSpeed } from './types';

interface ReactionSummary {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

export function summarizeReactions(
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

export function replySenderLabel(
  reply: ReplyPreview,
  userId: string | null,
  t: (key: string) => string,
): string {
  if (reply.sender_id === userId) return t('chat.you');
  return reply.profiles.display_name;
}

function ReplyQuote({
  reply,
  userId,
  isMine,
  onPress,
  onLongPress,
}: {
  reply: ReplyPreview;
  userId: string | null;
  isMine: boolean;
  onPress: () => void;
  // Forwarded so long-pressing the quote still opens the message menu,
  // as it would anywhere else on the bubble.
  onLongPress: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const snippet = reply.deleted_at
    ? t('chat.deletedMessage')
    : reply.body || attachmentPreviewText(reply.attachment_type, reply.attachment_name, t) || '';

  return (
    <Touchable
      style={[styles.replyQuote, isMine ? styles.replyQuoteMine : styles.replyQuoteTheirs]}
      onPress={onPress}
      onLongPress={onLongPress}
      // A deleted original has nothing left to jump to.
      disabled={Boolean(reply.deleted_at)}
      accessibilityRole="button"
      accessibilityHint={t('chat.a11yJumpToOriginal')}
    >
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
    </Touchable>
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
  positionMs,
  speed,
  onTogglePlay,
  onSeek,
  onCycleSpeed,
  onLongPress,
}: {
  message: LocalMessage;
  isMine: boolean;
  isPlaying: boolean;
  positionMs: number;
  speed: PlaybackSpeed;
  onTogglePlay: () => void;
  onSeek: (fraction: number) => void;
  onCycleSpeed: () => void;
  // Forwarded so long-pressing the voice row still opens the message menu.
  onLongPress: () => void;
}) {
  const { t } = useTranslation();
  const { colors, gradients } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const durationMs = message.attachment_duration_ms ?? 0;
  const totalSeconds = Math.round(durationMs / 1000);
  const progress = isPlaying && durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;
  const waveform = useMemo(
    () => waveformHeights(message.id, WAVEFORM_BAR_COUNT),
    [message.id],
  );
  const [waveformWidth, setWaveformWidth] = useState(0);
  const barColor = isMine ? colors.white : colors.ink;

  return (
    <View style={styles.audioRow}>
      <Touchable
        onPress={onTogglePlay}
        onLongPress={onLongPress}
        disabled={message._pending}
        iconButton
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? t('chat.a11yPause') : t('chat.a11yPlay')}
      >
        <View style={[styles.iconCircle, isMine ? styles.iconCircleMine : styles.iconCircleTheirs]}>
          <FontAwesome6
            name={isPlaying ? 'pause' : 'play'}
            iconStyle="solid"
            size={13}
            color={isMine ? gradients.mine[0] : colors.white}
          />
        </View>
      </Touchable>
      {/* Tap anywhere on the bars to jump there. A tap rather than a drag:
          dragging sideways on a bubble is already swipe-to-reply. */}
      <Touchable
        style={styles.waveform}
        onLayout={(e) => setWaveformWidth(e.nativeEvent.layout.width)}
        onPress={(e) => {
          if (waveformWidth > 0) onSeek(e.nativeEvent.locationX / waveformWidth);
        }}
        onLongPress={onLongPress}
        disabled={message._pending || durationMs === 0}
        ripple={null}
        accessibilityRole="button"
        accessibilityLabel={t('chat.a11yVoiceSeek')}
      >
        {waveform.map((height, i) => {
          // Played bars at full strength, the rest dimmed.
          const played = isPlaying && i / WAVEFORM_BAR_COUNT < progress;
          return (
            <View
              key={i}
              style={[
                styles.waveformBar,
                {
                  height,
                  backgroundColor: barColor,
                  opacity: !isPlaying ? (isMine ? 0.85 : 0.5) : played ? 1 : 0.35,
                },
              ]}
            />
          );
        })}
      </Touchable>
      <Text style={isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs}>
        {formatDuration(isPlaying ? Math.floor(positionMs / 1000) : totalSeconds)}
      </Text>
      {isPlaying && (
        <Touchable
          style={[styles.speedChip, isMine ? styles.speedChipMine : styles.speedChipTheirs]}
          onPress={onCycleSpeed}
          accessibilityRole="button"
          accessibilityLabel={t('chat.a11yPlaybackSpeed', { speed })}
        >
          <Text style={isMine ? styles.speedChipTextMine : styles.speedChipTextTheirs}>
            {speed}×
          </Text>
        </Touchable>
      )}
    </View>
  );
}

// The preview card under a message that contains a link - the first link,
// as messengers do. Renders nothing until there's something to show, and
// nothing at all for a page without a title.
function LinkPreviewCard({
  url,
  isMine,
  onLongPress,
}: {
  url: string;
  isMine: boolean;
  onLongPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [imageSource, setImageSource] = useState<{
    uri: string;
    headers: Record<string, string>;
  } | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setImageSource(null);
    setImageFailed(false);
    void fetchLinkPreview(url).then(async (result) => {
      if (cancelled) return;
      setPreview(result);
      if (result?.imageUrl) {
        const source = await linkPreviewImageSource(result.imageUrl);
        if (!cancelled) setImageSource(source);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!preview) return null;
  const site = preview.siteName ?? hostnameOf(url);

  return (
    <Touchable
      style={[styles.linkCard, isMine ? styles.linkCardMine : styles.linkCardTheirs]}
      onPress={() => void Linking.openURL(url).catch(() => {})}
      onLongPress={onLongPress}
      accessibilityRole="link"
      accessibilityLabel={preview.title}
    >
      {/* A page whose image won't load just shows its text - the card
          doesn't keep an empty box for it. */}
      {imageSource && !imageFailed && (
        <FastImage
          source={imageSource}
          style={styles.linkCardImage}
          resizeMode={FastImage.resizeMode.cover}
          onError={() => setImageFailed(true)}
        />
      )}
      {site && (
        <Text style={isMine ? styles.linkCardSiteMine : styles.linkCardSiteTheirs} numberOfLines={1}>
          {site}
        </Text>
      )}
      <Text style={isMine ? styles.linkCardTitleMine : styles.linkCardTitleTheirs} numberOfLines={2}>
        {preview.title}
      </Text>
      {preview.description && (
        <Text style={isMine ? styles.linkCardTextMine : styles.linkCardTextTheirs} numberOfLines={2}>
          {preview.description}
        </Text>
      )}
    </Touchable>
  );
}

function hostnameOf(url: string): string | null {
  const match = url.match(/^https?:\/\/([^/?#]+)/i);
  return match ? match[1].replace(/^www\./i, '') : null;
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

export type SeenBy = { name: string; avatarPath: string | null }[];

// Shared empties so a message with no reactions / nobody having seen it
// gets the *same* array every render - `?? []` would mint a new one each
// time and defeat the memo comparison below.
export const NO_REACTIONS: MessageReaction[] = [];
export const NO_SEEN_BY: SeenBy = [];

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
  isHighlighted: boolean;
  // Mine only; null on other people's messages.
  status: MessageStatus | null;
  // Display names of the people this message @mentions, for highlighting.
  mentionNames: string[];
  seenBy: SeenBy;
  bubbleMaxWidth: number;
  isPlaying: boolean;
  playbackPositionMs: number;
  playbackSpeed: PlaybackSpeed;
  // Set only on a message that opens a new calendar day, so it renders
  // a divider above itself. A string rather than a date, so it stays
  // comparable by value and the memo below still holds.
  dayLabel: string | null;
  // Receives where the bubble sits on screen, so the menu can lift it in
  // place - see MessageMenu.
  onLongPress: (message: LocalMessage, anchor: { y: number; height: number }) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onTogglePlay: (message: LocalMessage) => void;
  onSeekAudio: (message: LocalMessage, fraction: number) => void;
  onCyclePlaybackSpeed: () => void;
  onOpenImage: (path: string) => void;
  onReply: (message: LocalMessage) => void;
  onJumpToMessage: (messageId: string) => void;
  runPosition: RunPosition;
}

function MessageBubbleComponent({
  message,
  isMine,
  senderName,
  reactions,
  userId,
  isHighlighted,
  status,
  mentionNames,
  seenBy,
  bubbleMaxWidth,
  isPlaying,
  playbackPositionMs,
  playbackSpeed,
  dayLabel,
  onLongPress,
  onToggleReaction,
  onTogglePlay,
  onSeekAudio,
  onCyclePlaybackSpeed,
  onOpenImage,
  onReply,
  onJumpToMessage,
  runPosition,
}: MessageBubbleProps) {
  const { t, i18n } = useTranslation();
  const { colors, gradients } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const summary = useMemo(
    () => summarizeReactions(reactions, userId),
    [reactions, userId],
  );

  // The first link in the body, if any - the one a preview is shown for.
  const previewUrl = useMemo(
    () =>
      message.body && hasLink(message.body)
        ? linkifyText(message.body).find((segment) => segment.url)?.url ?? null
        : null,
    [message.body],
  );

  const bubbleRef = useRef<View>(null);
  const openMenu = useCallback(() => {
    const node = bubbleRef.current;
    if (!node) return;
    node.measureInWindow((_x, y, _width, height) => onLongPress(message, { y, height }));
  }, [message, onLongPress]);

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
      {/* collapsable={false}: Android drops plain wrapper views from the
          native tree, and a dropped view can't be measured. */}
      {/* Same rule as the menu's Reply: a message still sending has no
          server row yet to reply to. */}
      <SwipeToReply
        enabled={!message._pending}
        onReply={() => onReply(message)}
        iconColor={colors.smoke}
      >
      <View ref={bubbleRef} collapsable={false}>
      <Touchable onLongPress={openMenu}>
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
            <ReplyQuote
              reply={message.reply_to}
              userId={userId}
              isMine={isMine}
              onPress={() => message.reply_to && onJumpToMessage(message.reply_to.id)}
              onLongPress={openMenu}
            />
          )}
          {message.call_status && <CallLogRow message={message} isMine={isMine} />}
          {message.attachment_type === 'image' && message.media_path && (
            <Touchable
              // Long-press still has to reach the bubble's own handler,
              // or photos would be the one message type you can't react
              // to, reply to or delete.
              onPress={() => onOpenImage(message.media_path as string)}
              onLongPress={openMenu}
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
              positionMs={playbackPositionMs}
              speed={playbackSpeed}
              onTogglePlay={() => onTogglePlay(message)}
              onSeek={(fraction) => onSeekAudio(message, fraction)}
              onCycleSpeed={onCyclePlaybackSpeed}
              onLongPress={openMenu}
            />
          )}
          {message.attachment_type === 'file' && (
            <FileMessageBubble message={message} isMine={isMine} />
          )}
          {message.body && (
            <Text style={isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs}>
              {splitMentions(message.body, mentionNames).map((part, i) =>
                part.isMention ? (
                  <Text key={i} style={isMine ? styles.mentionMine : styles.mentionTheirs}>
                    {part.text}
                  </Text>
                ) : hasLink(part.text) ? (
                  linkifyText(part.text).map((segment, j) =>
                    segment.url ? (
                      <Text
                        key={`${i}-${j}`}
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
                ) : (
                  part.text
                ),
              )}
            </Text>
          )}
          {previewUrl && !message._pending && (
            <LinkPreviewCard url={previewUrl} isMine={isMine} onLongPress={openMenu} />
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
            {status && (
              <FontAwesome6
                name={STATUS_ICONS[status]}
                iconStyle="solid"
                size={10}
                color={colors.white}
                // Read stands out by being double and fully opaque; a
                // colour change would fight whichever bubble gradient the
                // user has picked.
                style={status === 'read' ? styles.statusRead : styles.statusMuted}
                accessibilityLabel={t(`chat.status.${status}`)}
              />
            )}
          </View>
        </LinearGradient>
      </Touchable>
      </View>
      </SwipeToReply>

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
export const MessageBubble = memo(MessageBubbleComponent);
