import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Modal,
  PermissionsAndroid,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
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
import { mergeReactions } from '../utils/reactions';
import * as mediaData from '../data/media';
import * as moderationData from '../data/moderation';
import type { ReportReason } from '../data/moderation';
import { Avatar } from '../components/Avatar';
import { Touchable } from '../components/Touchable';
import { AppWallpaper } from '../components/AppWallpaper';
import { MediaViewer } from '../components/MediaViewer';
import { FooterNav } from '../components/FooterNav';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmSheet';
import { useCall } from '../calling/CallContext';
import { useAppForeground } from '../hooks/useAppForeground';
import { useContentWidth } from '../hooks/useContentWidth';
import { usePresence } from '../presence/PresenceContext';
import { useUnread } from '../unread/UnreadContext';
import { useOutbox } from '../offline/OutboxContext';
import { useTyping } from '../typing/TypingContext';
import { OutboxEntry } from '../offline/outboxStorage';
import {
  attachmentPreviewText,
  callStatusPreviewText,
  formatDuration,
  formatLastSeen,
  formatMessageDay,
  messageIdsStartingADay,
  typingLabel,
} from '../utils/messagePreview';
import { haptic } from '../utils/haptics';
import Clipboard from '@react-native-clipboard/clipboard';
import { MessageMenu, MessageMenuAction } from '../components/MessageMenu';
import { useMuteChooser } from '../hooks/useMuteChooser';
import { isMuted } from '../utils/mute';
import {
  activeMentionQuery,
  insertMention,
  mentionsStillPresent,
  type PickedMention,
} from '../utils/mentions';
import { runPositions } from '../utils/messageGrouping';
import * as draftStorage from '../drafts/draftStorage';
import { spacing, MAX_BUBBLE_WIDTH } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';
import {
  Conversation,
  ConversationParticipant,
  Message,
  MessageReaction,
  Profile,
  ReplyPreview,
} from '../types';

import { makeStyles } from './chat/chatStyles';
import { LocalMessage, PLAYBACK_SPEEDS, type PlaybackSpeed } from './chat/types';
import { MessageBubble, NO_REACTIONS, NO_SEEN_BY, replySenderLabel } from './chat/MessageBubble';
import { ChatHistorySkeleton, TypingBubble } from './chat/ChatDecorations';
import { KeyboardAvoidingView, KeyboardGestureArea } from 'react-native-keyboard-controller';

type Props = NativeStackScreenProps<AppStackParamList, 'Chat'>;

const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];
const NO_REACTED: ReadonlySet<string> = new Set();
const NO_MENTION_NAMES: string[] = [];

const NO_ACTIONS: MessageMenuAction[] = [];

// Stands in for a sender who is no longer in the participant list (they
// left, or were removed) when building a reply preview - the preview only
// needs the id, and shows no name rather than failing.
function placeholderProfile(id: string): Profile {
  return {
    id,
    display_name: '',
    avatar_path: null,
    username: null,
    last_seen_at: null,
    show_read_receipts: true,
    show_last_seen: true,
  };
}
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
    mentions: entry.mentions,
    _pending: true,
  };
}

// Module scope so the FlatList gets the same function every render.
const messageKeyExtractor = (item: LocalMessage) => item.id;

export function ChatScreen({ route, navigation }: Props) {
  const { t, i18n } = useTranslation();
  const { conversationId, title } = route.params;
  const { userId } = useAuth();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { isOnline } = usePresence();
  const { markConversationRead } = useUnread();
  const outbox = useOutbox();
  const { typingConversationIds, typingUserIds, watch: watchTyping, sendTyping } = useTyping();
  const { startCall } = useCall();
  const insets = useSafeAreaInsets();
  const { windowWidth, contentWidth } = useContentWidth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const bubbleMaxWidth = Math.min(windowWidth * 0.8, MAX_BUBBLE_WIDTH);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  // For callbacks that need the current list without taking it as a
  // dependency (which would give them a new identity on every message).
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [isLoadingMoreMessages, setIsLoadingMoreMessages] = useState(false);
  const [didLoadFail, setDidLoadFail] = useState(false);
  const [hasLoadedMessages, setHasLoadedMessages] = useState(false);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const isScrolledUpRef = useRef(false);
  // Messages from others that arrived while scrolled up into history -
  // the count on the jump-to-latest button.
  const [unseenCount, setUnseenCount] = useState(0);
  const [viewerPath, setViewerPath] = useState<string | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<LocalMessage | null>(null);
  const [forwardTargets, setForwardTargets] = useState<Conversation[] | null>(null);
  const [reactions, setReactions] = useState<MessageReaction[]>([]);
  const [participants, setParticipants] = useState<ConversationParticipant[]>(
    [],
  );
  const [isGroup, setIsGroup] = useState(false);
  const [draft, setDraft] = useState('');
  // Where the cursor is, for the @mention suggestions - see onChangeDraft
  // for why it's also nudged on every text change.
  const [cursor, setCursor] = useState(0);
  // Set once to place the cursor after an inserted mention, then released
  // so the input isn't left fighting the user over where the cursor goes.
  const [forcedSelection, setForcedSelection] = useState<{ start: number; end: number } | null>(
    null,
  );
  const [pickedMentions, setPickedMentions] = useState<PickedMention[]>([]);
  const [menuTarget, setMenuTarget] = useState<{
    message: LocalMessage;
    anchorY: number;
    anchorHeight: number;
  } | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(
    null,
  );
  const [replyingTo, setReplyingTo] = useState<ReplyPreview | null>(null);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  // Where the playing voice message is, in ms - drives its progress bars.
  const [playbackPositionMs, setPlaybackPositionMs] = useState(0);
  // Kept across messages for the session, as messengers do: someone who
  // listens at 1.5x tends to want the next one at 1.5x too.
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const playbackSpeedRef = useRef<PlaybackSpeed>(1);
  playbackSpeedRef.current = playbackSpeed;
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
      try {
        Sound.removePlayBackListener();
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
      // Counted here rather than inside the updater below, which React may
      // run twice. Realtime can redeliver, so only a message not already
      // loaded counts.
      if (
        isScrolledUpRef.current &&
        incoming.sender_id !== userId &&
        !messagesRef.current.some((m) => m.id === incoming.id)
      ) {
        setUnseenCount((count) => count + 1);
      }
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
            )?.profiles ?? placeholderProfile(replied.sender_id);
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
    [markRead, userId],
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

  // Arriving from global search: load a window centred on the target
  // rather than the newest page, which could be thousands of messages
  // away. Reuses the same path as tapping an in-chat search result.
  const loadMessagesAround = useCallback(
    async (anchorMessageId: string) => {
      setDidLoadFail(false);
      try {
        const around = await conversationsData.fetchMessagesAround(
          conversationId,
          anchorMessageId,
        );
        setMessages(around);
        setReactions(
          await reactionsData.fetchReactionsForMessages(around.map((m) => m.id)),
        );
        setHighlightedMessageId(anchorMessageId);
      } catch {
        // Fall back to the normal newest-first load rather than an empty
        // screen: landing in the right conversation is most of the value.
        await loadMessages();
      } finally {
        setHasLoadedMessages(true);
      }
    },
    [conversationId, loadMessages],
  );

  useFocusEffect(
    useCallback(() => {
      const target = route.params.highlightMessageId;
      if (target) {
        // Consumed once: without clearing it, coming back to this screen
        // later would jump to the same old message again.
        navigation.setParams({ highlightMessageId: undefined });
        void loadMessagesAround(target);
        markRead();
        return;
      }
      void loadMessages();
      markRead();
    }, [loadMessages, loadMessagesAround, markRead, route.params.highlightMessageId, navigation]),
  );

  // An open chat that was backgrounded keeps navigation focus the whole
  // time, so the effect above does not re-run on return and the thread
  // would be missing everything that arrived meanwhile - see
  // useAppForeground. Marking read on return matches what opening the
  // screen does: the messages are on screen either way.
  useAppForeground(() => {
    void loadMessages();
    markRead();
  });

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
  const typingIds = typingUserIds[conversationId];
  const typingHeaderLabel = useMemo(() => {
    if (!typingIds?.length) return null;
    const names = typingIds
      .map((id) => participants.find((p) => p.user_id === id)?.profiles.display_name)
      .filter((name): name is string => Boolean(name));
    return typingLabel(names, t);
  }, [typingIds, participants, t]);

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
    // onChangeText arrives before onSelectionChange, so for a moment the
    // cursor we hold is from before this edit - and a suggestion list
    // computed from it would lag a character behind. Typing or deleting
    // moves the cursor by exactly the change in length; onSelectionChange
    // corrects anything else (a paste in the middle, a tap elsewhere).
    const delta = text.length - draft.length;
    setCursor((current) => Math.max(0, Math.min(text.length, current + delta)));
    if (!text) setPickedMentions([]);
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
    // Only people whose "@Name" survived to the final text.
    const mentions = mentionsStillPresent(body, pickedMentions);
    setPickedMentions([]);

    // Queued rather than sent directly - the outbox shows it immediately
    // (dimmed, via displayMessages) and takes care of retrying if this
    // fails or the device is offline, instead of the send just erroring
    // out. See OutboxContext for the retry/persistence behavior.
    void draftStorage.clearDraft(conversationId);
    haptic('tap');

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    outbox.queueMessage({
      conversationId,
      tempId,
      body,
      replyToMessageId,
      replyToPreview,
      mentions,
    });
    markRead();
  };

  // Group chats only, and not while editing: an edit changes the text but
  // not who the message notified, so offering mentions there would
  // promise something it can't do.
  const mentionQuery =
    isGroup && !editingMessageId && !isRecording ? activeMentionQuery(draft, cursor) : null;
  const mentionText = mentionQuery?.query ?? null;
  const mentionSuggestions = useMemo(() => {
    if (mentionText === null) return [];
    const q = mentionText.toLowerCase();
    return participants
      .filter(
        (p) =>
          p.user_id !== userId &&
          (p.profiles.display_name.toLowerCase().includes(q) ||
            (p.profiles.username ?? '').toLowerCase().includes(q)),
      )
      .slice(0, 5);
  }, [mentionText, participants, userId]);

  const onPickMention = (participant: ConversationParticipant) => {
    if (!mentionQuery) return;
    const name = participant.profiles.display_name;
    const next = insertMention(draft, mentionQuery.start, cursor, name);
    onChangeDraft(next.text);
    setCursor(next.cursor);
    setForcedSelection({ start: next.cursor, end: next.cursor });
    setPickedMentions((current) => [...current, { userId: participant.user_id, name }]);
    haptic('select');
  };

  // The empty chat's one-tap opener. Through the outbox like any send, so
  // it shows at once and survives being offline.
  const onSendWave = () => {
    haptic('tap');
    outbox.queueMessage({
      conversationId,
      tempId: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      body: '👋',
      replyToMessageId: null,
      replyToPreview: null,
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

  const stopPlayback = useCallback(async () => {
    await Sound.stopPlayer();
    Sound.removePlaybackEndListener();
    Sound.removePlayBackListener();
    setPlayingMessageId(null);
    setPlaybackPositionMs(0);
  }, []);

  // Resolves once playback has started (or failed), so a seek can follow.
  const startPlayback = useCallback(async (message: LocalMessage) => {
    if (!message.media_path) return false;
    try {
      const url = await mediaData.getMediaSignedUrl(message.media_path);
      await Sound.startPlayer(url);
      // Position updates ten times a second: smooth enough for 24 bars,
      // without re-rendering the list any faster than that.
      Sound.setSubscriptionDuration(0.1);
      Sound.addPlayBackListener((e) => setPlaybackPositionMs(e.currentPosition));
      Sound.addPlaybackEndListener(() => {
        Sound.removePlaybackEndListener();
        Sound.removePlayBackListener();
        setPlayingMessageId(null);
        setPlaybackPositionMs(0);
      });
      if (playbackSpeedRef.current !== 1) {
        await Sound.setPlaybackSpeed(playbackSpeedRef.current);
      }
      setPlaybackPositionMs(0);
      setPlayingMessageId(message.id);
      return true;
    } catch {
      setPlayingMessageId(null);
      return false;
    }
  }, []);

  const onTogglePlayback = useCallback(async (message: LocalMessage) => {
    if (!message.media_path) return;

    if (playingMessageId) {
      await stopPlayback();
      if (playingMessageId === message.id) return;
    }
    await startPlayback(message);
  }, [playingMessageId, stopPlayback, startPlayback]);

  // Tapping the waveform: jump to that point - starting the message first
  // if it isn't the one playing.
  const onSeekAudio = useCallback(
    async (message: LocalMessage, fraction: number) => {
      const durationMs = message.attachment_duration_ms ?? 0;
      if (!durationMs) return;
      const targetMs = Math.max(0, Math.min(1, fraction)) * durationMs;
      if (playingMessageId !== message.id) {
        if (playingMessageId) await stopPlayback();
        if (!(await startPlayback(message))) return;
      }
      try {
        await Sound.seekToPlayer(targetMs);
        setPlaybackPositionMs(targetMs);
      } catch {
        // A failed seek leaves playback running from where it was.
      }
    },
    [playingMessageId, stopPlayback, startPlayback],
  );

  const onCyclePlaybackSpeed = useCallback(() => {
    const next = PLAYBACK_SPEEDS[(PLAYBACK_SPEEDS.indexOf(playbackSpeedRef.current) + 1) % PLAYBACK_SPEEDS.length];
    setPlaybackSpeed(next);
    haptic('select');
    void Sound.setPlaybackSpeed(next).catch(() => {});
  }, []);

  const onToggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!userId) return;
      haptic('select');
      setMenuTarget(null);
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
    setMenuTarget(null);
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
      setMenuTarget(null);
      setEditingMessageId(null);
      const profile = participants.find(
        (p) => p.user_id === message.sender_id,
      )?.profiles ?? placeholderProfile(message.sender_id);
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
      setMenuTarget(null);
      void confirm({
        title: t('chat.deleteConfirmTitle'),
        message: t('chat.deleteConfirmMessage'),
        cancelLabel: t('chat.cancel'),
        options: [{ id: 'delete', label: t('chat.delete'), destructive: true }],
      }).then((choice) => {
        if (choice !== 'delete') return;
        void conversationsData.deleteMessage(messageId).then(() => {
          setMessages((current) => current.filter((m) => m.id !== messageId));
        });
      });
    },
    [t, confirm],
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

  // Brings any message into view and highlights it - shared by in-chat
  // search results and tapping a reply's quote. If it isn't in the window
  // already loaded, a fresh window centred on it is fetched first; either
  // way the highlight + scroll happens in the effect below once it's in
  // `messages`.
  //
  // Reads messages through a ref so this keeps one identity: it is handed
  // to every bubble, and a new function per message would defeat their
  // memo.
  const jumpToMessage = useCallback(
    async (messageId: string) => {
      const alreadyLoaded = messagesRef.current.some((m) => m.id === messageId);
      if (!alreadyLoaded) {
        try {
          const around = await conversationsData.fetchMessagesAround(conversationId, messageId);
          setMessages(around);
          // This replaces the loaded window wholesale rather than
          // extending it, so the reactions it carries are replaced too.
          setReactions(
            await reactionsData.fetchReactionsForMessages(around.map((m) => m.id)),
          );
        } catch {
          // Leave the existing window alone and say so, rather than
          // appearing to do nothing.
          showToast(t('chat.jumpToMessageFailedToast'));
          return;
        }
      }
      setHighlightedMessageId(messageId);
    },
    [conversationId, showToast, t],
  );

  const onSelectSearchResult = useCallback(
    async (result: conversationsData.MessageSearchResult) => {
      onCloseSearch();
      await jumpToMessage(result.id);
    },
    [onCloseSearch, jumpToMessage],
  );

  const onJumpToMessage = useCallback(
    (messageId: string) => void jumpToMessage(messageId),
    [jumpToMessage],
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
    const otherName = otherParticipant.profiles.display_name;
    const otherId = otherParticipant.user_id;

    if (isOtherBlocked) {
      void confirm({
        title: t('chat.unblockConfirmTitle'),
        message: t('chat.unblockConfirmMessage', { name: otherName }),
        cancelLabel: t('chat.cancel'),
        options: [{ id: 'unblock', label: t('chat.unblock') }],
      }).then((choice) => {
        if (choice !== 'unblock') return;
        void moderationData
          .unblockUser(userId, otherId)
          .then(() => {
            setIsOtherBlocked(false);
            showToast(t('chat.unblockSuccessToast'));
          })
          .catch(() => Alert.alert(t('chat.blockFailedTitle'), t('chat.blockFailedMessage')));
      });
      return;
    }

    void confirm({
      title: t('chat.blockConfirmTitle'),
      message: t('chat.blockConfirmMessage', { name: otherName }),
      cancelLabel: t('chat.cancel'),
      options: [{ id: 'block', label: t('chat.block'), destructive: true }],
    }).then((choice) => {
      if (choice !== 'block') return;
      void moderationData
        .blockUser(userId, otherId)
        .then(() => {
          setIsOtherBlocked(true);
          showToast(t('chat.blockSuccessToast'));
        })
        .catch(() => Alert.alert(t('chat.blockFailedTitle'), t('chat.blockFailedMessage')));
    });
  }, [userId, otherParticipant, isOtherBlocked, t, showToast, confirm]);

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

  const onOpenMenu = useCallback(
    (message: LocalMessage, anchor: { y: number; height: number }) => {
      haptic('press');
      setMenuTarget({ message, anchorY: anchor.y, anchorHeight: anchor.height });
    },
    [],
  );

  const onCloseMenu = useCallback(() => setMenuTarget(null), []);

  const onReportMessage = useCallback(
    (message: LocalMessage) => {
      setMenuTarget(null);
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

  const onSeek = useCallback(
    (message: LocalMessage, fraction: number) => void onSeekAudio(message, fraction),
    [onSeekAudio],
  );

  const senderNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of participants) {
      map.set(p.user_id, p.profiles.display_name);
    }
    return map;
  }, [participants]);

  const displayTitle =
    title ||
    (isGroup
      ? t('conversations.groupChat')
      : otherParticipant?.profiles.display_name) ||
    '…';

  const chooseMute = useMuteChooser();
  const myMutedUntil = participants.find((p) => p.user_id === userId)?.muted_until;

  const onOpenInfo = useCallback(() => {
    if (isGroup) navigation.navigate('GroupInfo', { conversationId });
    else if (otherParticipant) navigation.navigate('ContactInfo', { conversationId });
  }, [isGroup, otherParticipant, navigation, conversationId]);

  // Search, media and mute live here rather than as header icons - five
  // icons crowded the name onto three lines. Block and Report only make
  // sense in a one-to-one chat.
  const onOpenChatMenu = useCallback(() => {
    const muted = isMuted(myMutedUntil);
    void confirm({
      title: t('chat.menuTitle'),
      cancelLabel: t('chat.cancel'),
      options: [
        { id: 'search', label: t('chat.a11ySearch') },
        { id: 'media', label: t('chat.a11yGallery') },
        { id: 'mute', label: muted ? t('conversations.unmute') : t('conversations.mute') },
        ...(otherParticipant
          ? [
              {
                id: 'block',
                label: isOtherBlocked ? t('chat.unblock') : t('chat.block'),
                destructive: !isOtherBlocked,
              },
              { id: 'report', label: t('chat.reportTitle') },
            ]
          : []),
      ],
    }).then((choice) => {
      if (choice === 'search') setIsSearchOpen(true);
      else if (choice === 'media')
        navigation.navigate('MediaGallery', { conversationId, title: displayTitle });
      else if (choice === 'mute') {
        void chooseMute(conversationId, displayTitle, myMutedUntil).then((mutedUntil) => {
          if (mutedUntil === undefined) return;
          setParticipants((current) =>
            current.map((p) => (p.user_id === userId ? { ...p, muted_until: mutedUntil } : p)),
          );
        });
      } else if (choice === 'block') onToggleBlockOther();
      else if (choice === 'report' && otherParticipant) onReportUser(otherParticipant.user_id);
    });
  }, [
    otherParticipant,
    isOtherBlocked,
    onToggleBlockOther,
    onReportUser,
    t,
    confirm,
    myMutedUntil,
    chooseMute,
    conversationId,
    displayTitle,
    navigation,
    userId,
  ]);

  // Messenger-style read receipts: for each other participant, the
  // newest message of mine at or before *their* last_read_at is where
  // their avatar sits, moving down as that timestamp advances in real
  // time. The same per-participant logic covers both 1:1 (one avatar)
  // and groups (participants who've read different amounts each land
  // under their own newest-seen message, stacking together when several
  // people happen to have read up to the same point).
  //
  // Groups only: in a one-to-one chat the ticks below already say it, and
  // an avatar as well was the same fact twice. In a group the avatars add
  // what ticks can't - who has read how far.
  const seenAvatarsByMessageId = useMemo(() => {
    const result = new Map<string, { name: string; avatarPath: string | null }[]>();
    if (!isGroup) return result;
    for (const participant of participants) {
      if (participant.user_id === userId || !participant.last_read_at) continue;
      const readAt = new Date(participant.last_read_at).getTime();
      const seen = messages.find(
        (m) => m.sender_id === userId && new Date(m.created_at).getTime() <= readAt,
      );
      if (!seen) continue;
      const list = result.get(seen.id) ?? [];
      list.push({
        name: participant.profiles.display_name,
        avatarPath: participant.profiles.avatar_path,
      });
      result.set(seen.id, list);
    }
    return result;
  }, [participants, messages, userId, isGroup]);

  // Everything of mine sent at or before this moment has been read by
  // every other participant - what turns ✓ into ✓✓. Null when anyone
  // hasn't read anything, or hides their receipts (the server keeps their
  // last_read_at null - see 20260927_add_privacy_settings.sql), so their
  // messages stay at a single tick rather than claiming a read we can't
  // see. There is no separate "delivered" state: nothing records delivery.
  // Resolved once per list change rather than per row per render, so each
  // bubble gets the same array back and its memo holds. An id that isn't a
  // participant (they left) simply isn't highlighted.
  const mentionNamesByMessageId = useMemo(() => {
    const nameById = new Map(participants.map((p) => [p.user_id, p.profiles.display_name]));
    const result = new Map<string, string[]>();
    for (const message of displayMessages) {
      if (!message.mentions?.length) continue;
      const names = message.mentions
        .map((id) => nameById.get(id))
        .filter((name): name is string => Boolean(name));
      if (names.length) result.set(message.id, names);
    }
    return result;
  }, [participants, displayMessages]);

  const readByEveryoneUntilMs = useMemo(() => {
    const others = participants.filter((p) => p.user_id !== userId);
    if (others.length === 0) return null;
    let min = Infinity;
    for (const participant of others) {
      if (!participant.last_read_at) return null;
      min = Math.min(min, new Date(participant.last_read_at).getTime());
    }
    return min;
  }, [participants, userId]);

  // The list is inverted, so offset 0 is the newest message at the
  // bottom - scrolling "up" through history moves the offset up.
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const scrolledUp = event.nativeEvent.contentOffset.y > SCROLL_TO_BOTTOM_THRESHOLD;
    isScrolledUpRef.current = scrolledUp;
    setIsScrolledUp(scrolledUp);
    // Back at the newest messages means they've all been seen.
    if (!scrolledUp) setUnseenCount(0);
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

  // Targets are fetched when forwarding starts rather than kept in sync:
  // this screen has no reason to hold the conversation list otherwise, and
  // a stale list is worse than a brief spinner.
  const onForward = useCallback(
    (message: LocalMessage) => {
      setMenuTarget(null);
      setForwardingMessage(message);
      setForwardTargets(null);
      if (!userId) return;
      void conversationsData
        .fetchConversations(userId)
        .then((all) => setForwardTargets(all.filter((c) => c.id !== conversationId)))
        .catch(() => setForwardTargets([]));
    },
    [userId, conversationId],
  );

  const onForwardTo = useCallback(
    (target: Conversation) => {
      const message = forwardingMessage;
      if (!message || !userId) return;
      const { body, media_path: mediaPath, attachment_type: attachmentType } = message;
      if (!body && !mediaPath) return;
      setForwardingMessage(null);
      // Forwarded as new messages from the forwarder, not as a reply or a
      // link back to the original - the target conversation's members may
      // have no access to the conversation it came from.
      const send =
        mediaPath && attachmentType
          ? mediaData
              .copyMediaToConversation(mediaPath, target.id)
              .then((path) =>
                conversationsData.sendAttachmentMessage(target.id, userId, {
                  path,
                  type: attachmentType,
                  name: message.attachment_name,
                  mimeType: message.attachment_mime_type,
                  durationMs: message.attachment_duration_ms,
                }),
              )
          : conversationsData.sendMessage(target.id, userId, body ?? '', null);
      void send
        .then(() => showToast(t('chat.forwardedToast')))
        .catch(() =>
          Alert.alert(t('chat.forwardFailedTitle'), t('chat.forwardFailedMessage')),
        );
    },
    [forwardingMessage, userId, showToast, t],
  );

  // The menu's contents for the message it's open on. The conditions are
  // the ones the old strip used; Copy is new.
  const menu = useMemo(() => {
    if (!menuTarget) return null;
    const { message } = menuTarget;
    const isMine = message.sender_id === userId;
    const pending = Boolean(message._pending);
    const actions: MessageMenuAction[] = [];
    if (!pending) {
      actions.push({
        id: 'reply',
        label: t('chat.reply'),
        icon: 'reply',
        onPress: () => onReplyToMessage(message),
      });
    }
    if (message.body) {
      const body = message.body;
      actions.push({
        id: 'copy',
        label: t('chat.copy'),
        icon: 'copy',
        onPress: () => {
          setMenuTarget(null);
          Clipboard.setString(body);
          showToast(t('chat.copiedToast'));
        },
      });
    }
    if ((message.body || message.media_path) && !pending) {
      actions.push({
        id: 'forward',
        label: t('chat.forward'),
        icon: 'share',
        onPress: () => onForward(message),
      });
    }
    if (isMine && message.body) {
      actions.push({
        id: 'edit',
        label: t('chat.edit'),
        icon: 'pen',
        onPress: () => onEditMessage(message),
      });
    }
    if (isMine) {
      actions.push({
        id: 'delete',
        label: t('chat.delete'),
        icon: 'trash',
        destructive: true,
        onPress: () => onDeleteMessage(message.id),
      });
    }
    if (!isMine && !pending) {
      actions.push({
        id: 'report',
        label: t('chat.reportTitle'),
        icon: 'flag',
        destructive: true,
        onPress: () => onReportMessage(message),
      });
    }
    const reactedEmojis = new Set(
      (reactionsByMessageId.get(message.id) ?? NO_REACTIONS)
        .filter((r) => r.user_id === userId)
        .map((r) => r.emoji),
    );
    const previewText =
      message.body ||
      attachmentPreviewText(message.attachment_type, message.attachment_name, t) ||
      callStatusPreviewText(message.call_status, message.attachment_duration_ms, t) ||
      '';
    return {
      target: {
        anchorY: menuTarget.anchorY,
        anchorHeight: menuTarget.anchorHeight,
        isMine,
        previewText,
      },
      // A message still sending has nothing on the server to react to.
      reactions: pending ? [] : QUICK_REACTIONS,
      reactedEmojis,
      actions,
      messageId: message.id,
    };
  }, [
    menuTarget,
    userId,
    t,
    showToast,
    reactionsByMessageId,
    onReplyToMessage,
    onForward,
    onEditMessage,
    onDeleteMessage,
    onReportMessage,
  ]);

  const forwardTargetTitle = useCallback(
    (conversation: Conversation) => {
      if (conversation.is_group) return conversation.name ?? t('conversations.groupChat');
      const other = conversation.conversation_participants.find((p) => p.user_id !== userId);
      return (
        other?.profiles.display_name ??
        t('conversations.directMessage')
      );
    },
    [userId, t],
  );

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
        isHighlighted={item.id === highlightedMessageId}
        mentionNames={mentionNamesByMessageId.get(item.id) ?? NO_MENTION_NAMES}
        status={
          item.sender_id !== userId
            ? null
            : item._pending
              ? 'pending'
              : readByEveryoneUntilMs !== null &&
                  new Date(item.created_at).getTime() <= readByEveryoneUntilMs
                ? 'read'
                : 'sent'
        }
        bubbleMaxWidth={bubbleMaxWidth}
        isPlaying={playingMessageId === item.id}
        // Zero for every bubble but the playing one, so only that one's
        // props change as it plays and the rest keep their memo.
        playbackPositionMs={playingMessageId === item.id ? playbackPositionMs : 0}
        playbackSpeed={playbackSpeed}
        onSeekAudio={onSeek}
        onCyclePlaybackSpeed={onCyclePlaybackSpeed}
        seenBy={seenAvatarsByMessageId.get(item.id) ?? NO_SEEN_BY}
        dayLabel={dayLabelsByMessageId.get(item.id) ?? null}
        onLongPress={onOpenMenu}
        onToggleReaction={onToggleReactionForMessage}
        onTogglePlay={onTogglePlay}
        onOpenImage={onOpenImage}
        onReply={onReplyToMessage}
        onJumpToMessage={onJumpToMessage}
        runPosition={runPositionByMessageId.get(item.id) ?? 'single'}
      />
    ),
    [
      userId,
      isGroup,
      senderNames,
      reactionsByMessageId,
      highlightedMessageId,
      mentionNamesByMessageId,
      readByEveryoneUntilMs,
      bubbleMaxWidth,
      playingMessageId,
      playbackPositionMs,
      playbackSpeed,
      onSeek,
      onCyclePlaybackSpeed,
      seenAvatarsByMessageId,
      dayLabelsByMessageId,
      onOpenMenu,
      onToggleReactionForMessage,
      onTogglePlay,
      onOpenImage,
      onReplyToMessage,
      onJumpToMessage,
      runPositionByMessageId,
    ],
  );

  return (
    // react-native-keyboard-controller's, not React Native's: it moves the
    // composer with the keyboard frame by frame instead of jumping once the
    // keyboard has finished animating, and 'padding' now behaves the same
    // on Android as on iOS.
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      <AppWallpaper />
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
        {/* The whole identity block opens the info screen - the modern
            convention, and what keeps the header down to two icons. */}
        <Touchable
          style={styles.headerIdentity}
          onPress={onOpenInfo}
          accessibilityRole="button"
          accessibilityLabel={isGroup ? t('chat.a11yGroupInfo') : t('contactInfo.title')}
        >
        <Avatar
          name={displayTitle}
          avatarPath={isGroup ? null : otherParticipant?.profiles.avatar_path}
          size={36}
          online={
            isGroup || !otherParticipant ? undefined : isOnline(otherParticipant.user_id)
          }
        />
        <View style={styles.headerNameBlock}>
          <Text style={styles.headerName} numberOfLines={1}>{displayTitle}</Text>
          {/* Typing replaces the status line while it lasts - named in a
              group, where who matters; just "Typing..." one-to-one. */}
          {otherTyping && (
            <Text style={styles.headerStatus} numberOfLines={1}>
              {isGroup ? typingHeaderLabel ?? t('chat.typing') : t('chat.typing')}
            </Text>
          )}
          {/* Nothing at all for someone who hides their last seen -
              "Offline" would be a claim we can't make, since they may be
              online and simply not announcing it. */}
          {!otherTyping && !isGroup && otherParticipant && (
            isOnline(otherParticipant.user_id) ? (
              <Text style={styles.headerStatus} numberOfLines={1}>{t('chat.online')}</Text>
            ) : otherParticipant.profiles.show_last_seen === false ? null : (
              <Text style={styles.headerStatusOffline} numberOfLines={1}>
                {formatLastSeen(otherParticipant.profiles.last_seen_at, t)}
              </Text>
            )
          )}
        </View>
        </Touchable>
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
        <Touchable
          style={styles.callButton}
          iconButton
          onPress={onOpenChatMenu}
          accessibilityRole="button"
          accessibilityLabel={t('chat.a11yMenu')}
        >
          <FontAwesome6 name="ellipsis-vertical" iconStyle="solid" size={16} color={colors.ink} />
        </Touchable>
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
      ) : displayMessages.length === 0 ? (
        // A brand-new conversation used to be a blank screen. Says who
        // you're talking to and offers the easiest possible first move.
        <View style={styles.loadError}>
          <Text style={styles.emptyChatEmoji}>👋</Text>
          <Text style={styles.loadErrorTitle}>
            {isGroup ? t('chat.emptyGroupTitle') : t('chat.emptyChatTitle', { name: displayTitle })}
          </Text>
          <Text style={styles.loadErrorHint}>{t('chat.emptyChatHint')}</Text>
          <Touchable
            style={styles.loadErrorButton}
            onPress={onSendWave}
            pressScale
            accessibilityRole="button"
          >
            <Text style={styles.loadErrorButtonText}>{t('chat.sendWave')}</Text>
          </Touchable>
        </View>
      ) : (
        // Drag the keyboard down with the list on Android, as in Telegram -
        // 'ios' means it follows the finger once the finger reaches it.
        // keyboardDismissMode is the same gesture on iOS.
        <KeyboardGestureArea style={styles.listArea} interpolator="ios">
        <FlatList
          ref={flatListRef}
          style={styles.list}
          keyboardDismissMode="interactive"
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
        </KeyboardGestureArea>
      )}
      {isScrolledUp && !isSearchOpen && (
        <Touchable
          style={styles.jumpToLatest}
          iconButton
          onPress={onJumpToLatest}
          accessibilityRole="button"
          accessibilityLabel={
            unseenCount > 0
              ? t('chat.jumpToLatestWithCount', { n: unseenCount })
              : t('chat.jumpToLatest')
          }
        >
          <FontAwesome6 name="chevron-down" iconStyle="solid" size={14} color={colors.ink} />
          {unseenCount > 0 && (
            <View style={styles.jumpBadge}>
              <Text style={styles.jumpBadgeText}>{unseenCount > 99 ? '99+' : unseenCount}</Text>
            </View>
          )}
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
      {mentionSuggestions.length > 0 && (
        <View style={styles.mentionList}>
          {mentionSuggestions.map((participant) => (
            <Touchable
              key={participant.user_id}
              style={styles.mentionRow}
              onPress={() => onPickMention(participant)}
              accessibilityRole="button"
            >
              <Avatar
                name={participant.profiles.display_name}
                avatarPath={participant.profiles.avatar_path}
                size={28}
              />
              <Text style={styles.mentionName} numberOfLines={1}>
                {participant.profiles.display_name}
              </Text>
              {participant.profiles.username && (
                <Text style={styles.mentionUsername} numberOfLines={1}>
                  @{participant.profiles.username}
                </Text>
              )}
            </Touchable>
          ))}
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
              pressScale
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
              selection={forcedSelection ?? undefined}
              onSelectionChange={(event) => {
                setCursor(event.nativeEvent.selection.end);
                if (forcedSelection) setForcedSelection(null);
              }}
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
                pressScale
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
                pressScale
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

      <MessageMenu
        target={menu?.target ?? null}
        reactions={menu?.reactions ?? QUICK_REACTIONS}
        reactedEmojis={menu?.reactedEmojis ?? NO_REACTED}
        actions={menu?.actions ?? NO_ACTIONS}
        onReact={(emoji) => menu && onToggleReactionForMessage(menu.messageId, emoji)}
        onClose={onCloseMenu}
      />

      <Modal
        visible={forwardingMessage !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setForwardingMessage(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('chat.forwardTitle')}</Text>
            {forwardTargets === null ? (
              <ActivityIndicator style={styles.spinner} color={colors.ember} />
            ) : forwardTargets.length === 0 ? (
              <Text style={styles.modalMessage}>{t('chat.forwardNoTargets')}</Text>
            ) : (
              <ScrollView style={styles.forwardList} keyboardShouldPersistTaps="handled">
                {forwardTargets.map((target) => {
                  const name = forwardTargetTitle(target);
                  return (
                    <Touchable
                      key={target.id}
                      style={styles.forwardRow}
                      onPress={() => onForwardTo(target)}
                      accessibilityRole="button"
                    >
                      <Avatar
                        name={name}
                        avatarPath={
                          target.is_group
                            ? null
                            : target.conversation_participants.find(
                                (p) => p.user_id !== userId,
                              )?.profiles.avatar_path
                        }
                        size={34}
                      />
                      <Text style={styles.forwardName} numberOfLines={1}>
                        {name}
                      </Text>
                    </Touchable>
                  );
                })}
              </ScrollView>
            )}
            <Touchable
              style={styles.reportCancel}
              onPress={() => setForwardingMessage(null)}
              accessibilityRole="button"
            >
              <Text style={styles.reportCancelText}>{t('chat.cancel')}</Text>
            </Touchable>
          </View>
        </View>
      </Modal>

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
    </KeyboardAvoidingView>
  );
}
