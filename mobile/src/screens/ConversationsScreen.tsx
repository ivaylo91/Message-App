import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  LayoutAnimation,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { FontAwesome6 } from '@react-native-vector-icons/fontawesome6/static';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../auth/AuthContext';
import * as conversationsData from '../data/conversations';
import * as profilesData from '../data/profiles';
import * as draftStorage from '../drafts/draftStorage';
import { Avatar } from '../components/Avatar';
import { Touchable } from '../components/Touchable';
import { useConfirm } from '../components/ConfirmSheet';
import { useToast } from '../components/Toast';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { AppLogo } from '../components/AppLogo';
import { FooterNav } from '../components/FooterNav';
import { useAppForeground } from '../hooks/useAppForeground';
import { useMuteChooser } from '../hooks/useMuteChooser';
import { useContentWidth } from '../hooks/useContentWidth';
import { usePresence } from '../presence/PresenceContext';
import { useUnread } from '../unread/UnreadContext';
import { useTyping } from '../typing/TypingContext';
import { useMessageStream } from '../messages/MessageStreamContext';
import {
  attachmentPreviewText,
  callStatusPreviewText,
  formatListTimestamp,
} from '../utils/messagePreview';
import {
  applyIncomingMessage,
  CHAT_FILTERS,
  matchesChatFilter,
  type ChatFilter,
  MAX_PINNED_CONVERSATIONS,
  pinnedAtFor,
  pinnedFirst,
} from '../utils/conversationList';
import { isMuted } from '../utils/mute';
import { fontSizes, radii, spacing, ThemeColors } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';
import { SPRING_TAP } from '../theme/motion';
import { Conversation, Message, Profile } from '../types';

type Props = NativeStackScreenProps<AppStackParamList, 'Conversations'>;

const MESSAGE_SEARCH_DEBOUNCE_MS = 300;
const CHAT_FILTER_KEY = 'chatFilter:v1';
const FILTER_LABEL_KEYS: Record<ChatFilter, string> = {
  all: 'conversations.filterAll',
  unread: 'conversations.filterUnread',
  groups: 'conversations.filterGroups',
};
const SWIPE_DELETE_WIDTH = 84;
const SWIPE_OPEN_THRESHOLD = -40;

interface ConversationRowProps {
  title: string;
  muted: boolean;
  pinned: boolean;
  avatarPath: string | null | undefined;
  online: boolean | undefined;
  unreadCount: number;
  // Flagged with "Mark as unread" - shown as a dot when there's no count.
  markedUnread: boolean;
  isTyping: boolean;
  preview: string;
  // The last message's created_at; null for a conversation with none yet.
  timestamp: string | null;
  // Unsent text saved for this conversation, shown instead of the last
  // message so it isn't forgotten.
  draft: string | null;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onPress: () => void;
  onLongPress: () => void;
  onDelete: () => void;
}

// Swipe left to reveal a Delete action underneath. Only one row's delete
// action is open at a time (isOpen/onOpen/onClose, coordinated by the
// parent), matching the usual Mail/WhatsApp-style swipe list feel.
function ConversationRow({
  title,
  muted,
  pinned,
  avatarPath,
  online,
  unreadCount,
  markedUnread,
  isTyping,
  preview,
  timestamp,
  draft,
  isOpen,
  onOpen,
  onClose,
  onPress,
  onLongPress,
  onDelete,
}: ConversationRowProps) {
  const { t, i18n } = useTranslation();
  const showsUnread = unreadCount > 0 || markedUnread;
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Swipe left to reveal Delete. On the UI thread (Gesture Handler +
  // Reanimated), like swipe-to-reply in a chat. It previously ran on
  // PanResponder, created once on first render - so it also kept that
  // render's onOpen/onClose; these callbacks track the current props.
  const translateX = useSharedValue(0);
  // Where the row rests: 0 (closed) or -SWIPE_DELETE_WIDTH (open).
  const openX = useSharedValue(0);
  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));

  // Another row opening closes this one.
  useEffect(() => {
    if (!isOpen && openX.value !== 0) {
      openX.value = 0;
      translateX.value = withSpring(0, SPRING_TAP);
    }
  }, [isOpen, openX, translateX]);

  const pan = usePanGesture({
    // Horizontal only: a vertical move fails it, so the list scrolls.
    activeOffsetX: [-10, 10],
    failOffsetY: [-10, 10],
    onActivate: () => {
      'worklet';
      scheduleOnRN(onOpen);
    },
    onUpdate: (event) => {
      'worklet';
      translateX.value = Math.max(
        -SWIPE_DELETE_WIDTH,
        Math.min(0, openX.value + event.translationX),
      );
    },
    onDeactivate: () => {
      'worklet';
      const shouldOpen = translateX.value < SWIPE_OPEN_THRESHOLD;
      openX.value = shouldOpen ? -SWIPE_DELETE_WIDTH : 0;
      translateX.value = withSpring(openX.value, SPRING_TAP);
      if (!shouldOpen) scheduleOnRN(onClose);
    },
  });

  return (
    <View style={styles.rowContainer}>
      <Touchable
        style={styles.deleteAction}
        onPress={onDelete}
        accessibilityRole="button"
        accessibilityLabel={t('conversations.a11yDelete')}
      >
        <FontAwesome6 name="trash" iconStyle="solid" size={18} color={colors.white} />
      </Touchable>
      <GestureDetector gesture={pan}>
      <Animated.View style={[styles.rowForeground, rowStyle]}>
        <Touchable style={styles.row} onPress={onPress} onLongPress={onLongPress}>
          <Avatar name={title} avatarPath={avatarPath} online={online} />
          <View style={styles.rowMain}>
            <View style={styles.rowTitleLine}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {title}
              </Text>
              {muted && (
                <FontAwesome6
                  name="bell-slash"
                  iconStyle="solid"
                  size={12}
                  color={colors.smoke}
                />
              )}
              {pinned && (
                <FontAwesome6
                  name="thumbtack"
                  iconStyle="solid"
                  size={11}
                  color={colors.smoke}
                  accessibilityLabel={t('conversations.pinned')}
                />
              )}
              {timestamp && (
                <Text
                  style={[styles.rowTime, showsUnread && !muted && styles.rowTimeUnread]}
                  numberOfLines={1}
                >
                  {formatListTimestamp(timestamp, t, i18n.language)}
                </Text>
              )}
            </View>
            <View style={styles.rowPreviewLine}>
              <Text
                style={[
                  styles.rowPreview,
                  isTyping && styles.rowPreviewTyping,
                  !isTyping && showsUnread && styles.rowPreviewUnread,
                ]}
                numberOfLines={1}
              >
                {/* Someone typing beats a draft: it's what's happening now. */}
                {draft && !isTyping ? (
                  <>
                    <Text style={styles.rowDraftLabel}>{t('conversations.draftPrefix')} </Text>
                    {draft.replace(/\s+/g, ' ').trim()}
                  </>
                ) : (
                  preview
                )}
              </Text>
              {unreadCount > 0 ? (
                // Grey rather than ember when muted: the count is still
                // there to see, but it isn't asking for attention.
                <View style={[styles.unreadBadge, muted && styles.unreadBadgeMuted]}>
                  <Text style={styles.unreadBadgeText}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              ) : markedUnread ? (
                <View
                  style={[styles.unreadDot, muted && styles.unreadBadgeMuted]}
                  accessibilityLabel={t('conversations.markedUnread')}
                />
              ) : null}
            </View>
          </View>
        </Touchable>
      </Animated.View>
      </GestureDetector>
    </View>
  );
}

const SKELETON_ROW_COUNT = 7;

// Mirrors ConversationRow's geometry - avatar, title, preview - so the
// real rows land where the placeholders were instead of shifting.
function ConversationListSkeleton() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <SkeletonGroup>
      {Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
        <View key={i} style={styles.skeletonRow}>
          <Skeleton width={48} height={48} radius={24} />
          <View style={styles.skeletonText}>
            <Skeleton width="55%" height={13} />
            <Skeleton width="80%" height={11} />
          </View>
        </View>
      ))}
    </SkeletonGroup>
  );
}

export function ConversationsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { userId } = useAuth();
  const { isOnline } = usePresence();
  const {
    unreadCounts,
    refresh: refreshUnreadCounts,
    markConversationRead,
  } = useUnread();

  // The selected chip, remembered on this device between visits.
  const [chatFilter, setChatFilter] = useState<ChatFilter>('all');
  useEffect(() => {
    void AsyncStorage.getItem(CHAT_FILTER_KEY)
      .then((saved) => {
        if (saved && (CHAT_FILTERS as string[]).includes(saved)) setChatFilter(saved as ChatFilter);
      })
      .catch(() => {});
  }, []);
  const onSelectFilter = useCallback((filter: ChatFilter) => {
    setChatFilter(filter);
    void AsyncStorage.setItem(CHAT_FILTER_KEY, filter).catch(() => {});
  }, []);
  const { typingConversationIds, watch: watchTyping } = useTyping();
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const { subscribe: subscribeToMessages } = useMessageStream();
  const insets = useSafeAreaInsets();
  const { contentWidth } = useContentWidth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  // Read synchronously by the realtime handler below, which can fire
  // several times before React re-renders - same reason (and same
  // pattern) as entriesRef in OutboxContext.
  const conversationsRef = useRef<Conversation[]>([]);
  conversationsRef.current = conversations;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [ownProfile, setOwnProfile] = useState<Profile | null>(null);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  // Guards against a burst of messages for unknown conversations firing
  // overlapping refetches.
  const isLoadingRef = useRef(false);
  const pendingReloadRef = useRef(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [messageHits, setMessageHits] = useState<
    conversationsData.GlobalMessageSearchResult[]
  >([]);
  const [isSearchingMessages, setIsSearchingMessages] = useState(false);
  const messageSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function previewText(message: Message | undefined): string {
    if (!message) return t('conversations.noMessagesYet');
    return (
      callStatusPreviewText(message.call_status, message.attachment_duration_ms, t) ||
      attachmentPreviewText(message.attachment_type, message.attachment_name, t) ||
      message.body ||
      t('conversations.noMessagesYet')
    );
  }

  const load = useCallback(async () => {
    if (!userId) return;
    // Collapse overlapping loads (a burst of messages for conversations
    // this list doesn't know about would otherwise fire one refetch
    // each), but don't simply drop them: a request that arrives while a
    // fetch is already in flight may concern a row that fetch's query
    // ran too early to see, so it's remembered and re-run once.
    if (isLoadingRef.current) {
      pendingReloadRef.current = true;
      return;
    }
    isLoadingRef.current = true;
    setIsRefreshing(true);
    try {
      do {
        pendingReloadRef.current = false;
        const [data] = await Promise.all([
          conversationsData.fetchConversations(userId),
          refreshUnreadCounts(),
        ]);
        conversationsRef.current = data;
        setConversations(data);
      } while (pendingReloadRef.current);
    } finally {
      isLoadingRef.current = false;
      pendingReloadRef.current = false;
      setIsRefreshing(false);
      // Resolved either way - a genuinely empty list can now say so.
      setHasLoadedOnce(true);
    }
  }, [userId, refreshUnreadCounts]);

  // Keeps the list current while it's on screen: a new message refreshes
  // that row's preview and moves it to the top, instead of the row
  // sitting there with stale text until the next focus or pull-to-
  // refresh. Unread badges were already live (UnreadContext), which made
  // the staleness especially visible - a badge would appear next to a
  // preview of the previous message.
  useEffect(
    () =>
      subscribeToMessages((incoming) => {
        const { conversations: next, needsRefetch } = applyIncomingMessage(
          conversationsRef.current,
          incoming,
        );
        // A conversation the list has never seen - someone started a new
        // one, or a message just un-hid one this user had deleted. Only a
        // refetch can fill in participants and profiles.
        if (needsRefetch) {
          void load();
          return;
        }
        if (next === conversationsRef.current) return;
        // The reordering this causes - a conversation jumping to the top
        // - used to happen in a single frame, which reads as the list
        // flickering rather than as a row moving. One line of
        // LayoutAnimation makes it legible as movement. It is a no-op
        // rather than an error where the platform doesn't support it.
        LayoutAnimation.configureNext({
          duration: 220,
          update: { type: 'easeInEaseOut', property: 'scaleXY' },
          create: { type: 'easeInEaseOut', property: 'opacity', duration: 160 },
        });
        conversationsRef.current = next;
        setConversations(next);
      }),
    [subscribeToMessages, load],
  );

  // Long-press rather than another swipe action: the swipe already reveals
  // Delete, and mute has four outcomes rather than one.
  const chooseMute = useMuteChooser();
  const onLongPressConversation = useCallback(
    (conversation: Conversation, title: string) => {
      if (!userId) return;
      const mine = conversation.conversation_participants.find((p) => p.user_id === userId);
      const pinned = Boolean(mine?.pinned_at);
      const hasUnread = Boolean(mine?.marked_unread) || (unreadCounts[conversation.id] ?? 0) > 0;
      void confirm({
        title,
        cancelLabel: t('chat.cancel'),
        options: [
          {
            id: 'unread',
            label: hasUnread ? t('conversations.markRead') : t('conversations.markUnread'),
          },
          { id: 'pin', label: pinned ? t('conversations.unpin') : t('conversations.pin') },
          {
            id: 'mute',
            label: isMuted(mine?.muted_until) ? t('conversations.unmute') : t('conversations.mute'),
          },
        ],
      }).then((choice) => {
        if (choice === 'unread') {
          // Mark as read goes through the same path as opening the chat,
          // which also clears the flag; mark as unread only sets the flag -
          // the messages themselves stay read.
          const request = hasUnread
            ? Promise.resolve(markConversationRead(conversation.id))
            : conversationsData.setConversationMarkedUnread(conversation.id, userId, true);
          void request
            .then(() => load())
            .catch(() => showToast(t('conversations.markUnreadFailedToast')));
          return;
        }
        if (choice === 'mute') {
          void chooseMute(conversation.id, title, mine?.muted_until).then((result) => {
            // Reload rather than patching in place: these values live on the
            // participant row the list already carries, so a refetch keeps
            // the row and the server in step without a second source of truth.
            if (result !== undefined) void load();
          });
          return;
        }
        if (choice !== 'pin') return;
        if (!pinned) {
          const pinnedCount = conversationsRef.current.filter((c) =>
            Boolean(pinnedAtFor(c, userId)),
          ).length;
          if (pinnedCount >= MAX_PINNED_CONVERSATIONS) {
            showToast(t('conversations.pinLimitToast', { count: MAX_PINNED_CONVERSATIONS }));
            return;
          }
        }
        void conversationsData
          .setConversationPinned(conversation.id, userId, pinned ? null : new Date().toISOString())
          .then(() => load())
          .catch(() => showToast(t('conversations.pinFailedToast')));
      });
    },
    [userId, confirm, t, chooseMute, load, showToast, unreadCounts, markConversationRead],
  );

  const onDeleteConversation = useCallback(
    (conversation: Conversation, title: string) => {
      void confirm({
        title: t('conversations.deleteConfirmTitle'),
        message: t('conversations.deleteConfirmMessage', { name: title }),
        cancelLabel: t('chat.cancel'),
        options: [
          { id: 'delete', label: t('conversations.delete'), destructive: true },
        ],
      }).then((choice) => {
        if (choice !== 'delete') {
          // Dismissing leaves the swiped row open, so it has to be closed
          // explicitly - the old Alert did this from its cancel button.
          setOpenRowId(null);
          return;
        }
        if (!userId) return;
        setConversations((current) => current.filter((c) => c.id !== conversation.id));
        conversationsData.hideConversation(conversation.id, userId).catch(() => {
          // best-effort - a failed hide just leaves the row visible after next refresh
        });
      });
    },
    [t, userId, confirm],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Re-read on every focus: coming back from a chat is exactly when a
  // draft has just been written or cleared.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  useFocusEffect(
    useCallback(() => {
      void draftStorage.loadAllDrafts().then(setDrafts);
    }, []),
  );

  // Anything that arrived while the app was away was missed by both the
  // focus effect above and the realtime subscription below - see
  // useAppForeground.
  useAppForeground(() => {
    void load();
  });

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      void profilesData.fetchProfile(userId).then(setOwnProfile);
    }, [userId]),
  );

  // Shows "Typing..." in the list before a chat is even opened. The
  // channels themselves belong to TypingProvider rather than this screen:
  // this screen and ChatScreen are both mounted at once (the list stays
  // in the stack underneath the open chat) and would otherwise be fighting
  // over the same realtime topic - see TypingContext.tsx.
  const watchedConversationIds = useMemo(
    () => conversations.map((conversation) => conversation.id),
    [conversations],
  );

  useEffect(
    () => watchTyping(watchedConversationIds),
    [watchTyping, watchedConversationIds],
  );

  // The conversation filter below stays client-side and instant; message
  // bodies need the server, so that half is debounced. Two different kinds
  // of result, deliberately shown in one list under their own headings.
  const onChangeSearch = useCallback(
    (text: string) => {
      setSearchQuery(text);
      if (messageSearchRef.current) clearTimeout(messageSearchRef.current);
      if (text.trim().length < 2) {
        setMessageHits([]);
        setIsSearchingMessages(false);
        return;
      }
      setIsSearchingMessages(true);
      messageSearchRef.current = setTimeout(() => {
        conversationsData
          .searchAllMessages(text)
          .then(setMessageHits)
          .catch(() => setMessageHits([]))
          .finally(() => setIsSearchingMessages(false));
      }, MESSAGE_SEARCH_DEBOUNCE_MS);
    },
    [],
  );

  const otherParticipantOf = (conversation: Conversation) =>
    conversation.conversation_participants.find((p) => p.user_id !== userId);

  const conversationTitle = (conversation: Conversation) => {
    if (conversation.is_group)
      return conversation.name ?? t('conversations.groupChat');
    const other = otherParticipantOf(conversation);
    return (
      other?.profiles.display_name ??
      t('conversations.directMessage')
    );
  };

  // Plain client-side filter over the already-loaded list, matched
  // against both the row's title and its last-message preview - the same
  // two things ConversationRow renders, so a match always makes sense to
  // the person reading the results.
  const trimmedSearchQuery = searchQuery.trim().toLowerCase();
  // Search looks across every chat, whatever chip is selected - the chips
  // hide while searching, so a filter can't silently narrow the results.
  const filteredConversations = trimmedSearchQuery
    ? conversations.filter((conversation) => {
        const title = conversationTitle(conversation).toLowerCase();
        const preview = previewText(conversation.messages?.[0]).toLowerCase();
        return title.includes(trimmedSearchQuery) || preview.includes(trimmedSearchQuery);
      })
    : chatFilter === 'all'
      ? conversations
      : conversations.filter((c) => matchesChatFilter(c, chatFilter, userId, unreadCounts));
  const unreadChatCount = conversations.filter((c) =>
    matchesChatFilter(c, 'unread', userId, unreadCounts),
  ).length;
  const orderedConversations = useMemo(
    () => pinnedFirst(filteredConversations, userId),
    [filteredConversations, userId],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.lg }]}>
      <View style={[styles.content, { maxWidth: contentWidth }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Touchable
            onPress={() => navigation.navigate('Profile')}
            accessibilityRole="button"
            accessibilityLabel={t('conversations.a11yProfile')}
          >
            <Avatar
              name={ownProfile?.display_name || '?'}
              avatarPath={ownProfile?.avatar_path}
              size={40}
              online={userId ? isOnline(userId) : undefined}
            />
          </Touchable>
          <Text style={styles.headerTitle}>{t('conversations.title')}</Text>
          <AppLogo size={26} />
        </View>
        {/* The EN/BG chips that used to sit here moved to ProfileScreen,
            alongside the theme and bubble-colour choices - a setting
            changed once shouldn't hold the most valuable space in the
            header of the screen people open most. */}
        <View style={styles.headerActions}>
          <Touchable
            style={styles.iconButton}
            iconButton
            onPress={() => navigation.navigate('NewChat')}
            accessibilityRole="button"
            accessibilityLabel={t('conversations.a11yNewChat')}
          >
            <FontAwesome6 name="pen-to-square" iconStyle="solid" size={15} color={colors.ink} />
          </Touchable>
        </View>
      </View>

      <View style={styles.searchBar}>
        <FontAwesome6 name="magnifying-glass" iconStyle="solid" size={13} color={colors.smoke} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('conversations.searchPlaceholder')}
          placeholderTextColor={colors.smoke}
          autoCapitalize="none"
          value={searchQuery}
          onChangeText={onChangeSearch}
        />
        {searchQuery.length > 0 && (
          <Touchable
            onPress={() => setSearchQuery('')}
            accessibilityRole="button"
            accessibilityLabel={t('conversations.a11yClearSearch')}
          >
            <FontAwesome6 name="xmark" iconStyle="solid" size={13} color={colors.smoke} />
          </Touchable>
        )}
      </View>

      {!trimmedSearchQuery && (
        <View style={styles.filterRow} accessibilityRole="tablist">
          {CHAT_FILTERS.map((filter) => {
            const selected = filter === chatFilter;
            const label =
              filter === 'unread' && unreadChatCount > 0
                ? `${t('conversations.filterUnread')} · ${unreadChatCount}`
                : t(FILTER_LABEL_KEYS[filter]);
            return (
              <Touchable
                key={filter}
                style={[styles.filterChip, selected && styles.filterChipSelected]}
                onPress={() => onSelectFilter(filter)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.filterText, selected && styles.filterTextSelected]}>
                  {label}
                </Text>
              </Touchable>
            );
          })}
        </View>
      )}

      <FlatList
        data={orderedConversations}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={load} />
        }
        // While searching, both sections read the same way - a heading,
        // then results or a one-line "nothing here". The full-size empty
        // state used to fill this spot when no conversation matched,
        // pushing the message results that did match halfway down the
        // screen.
        ListHeaderComponent={
          trimmedSearchQuery ? (
            <View>
              <Text style={styles.sectionHeading}>
                {t('conversations.conversationsSection')}
              </Text>
              {filteredConversations.length === 0 && (
                <Text style={styles.sectionHint}>{t('conversations.noSearchResults')}</Text>
              )}
            </View>
          ) : null
        }
        ListFooterComponent={
          trimmedSearchQuery ? (
            <View>
              <Text style={styles.sectionHeading}>
                {t('conversations.messagesSection')}
              </Text>
              {isSearchingMessages && messageHits.length === 0 ? (
                <Text style={styles.sectionHint}>
                  {t('conversations.searchingMessages')}
                </Text>
              ) : messageHits.length === 0 ? (
                <Text style={styles.sectionHint}>
                  {t('conversations.noMessageMatches')}
                </Text>
              ) : (
                messageHits.map((hit) => {
                  const conv = hit.conversations;
                  const other = conv.conversation_participants.find(
                    (p) => p.user_id !== userId,
                  );
                  const name = conv.is_group
                    ? conv.name ?? t('conversations.groupChat')
                    : other?.profiles.display_name ??
                      t('conversations.directMessage');
                  return (
                    <Touchable
                      key={hit.id}
                      style={styles.hitRow}
                      onPress={() =>
                        navigation.navigate('Chat', {
                          conversationId: hit.conversation_id,
                          title: name,
                          // Lands on the message itself rather than the
                          // newest page, which could be far away.
                          highlightMessageId: hit.id,
                        })
                      }
                      accessibilityRole="button"
                    >
                      <Avatar
                        name={name}
                        avatarPath={conv.is_group ? null : other?.profiles.avatar_path}
                        size={34}
                      />
                      <View style={styles.rowMain}>
                        <Text style={styles.hitTitle} numberOfLines={1}>
                          {name}
                        </Text>
                        <Text style={styles.hitBody} numberOfLines={1}>
                          {hit.body}
                        </Text>
                      </View>
                    </Touchable>
                  );
                })
              )}
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const title = conversationTitle(item);
          const other = otherParticipantOf(item);
          const isTyping = typingConversationIds.has(item.id);
          const unreadCount = unreadCounts[item.id] ?? 0;
          return (
            <ConversationRow
              title={title}
              muted={isMuted(
                item.conversation_participants.find((p) => p.user_id === userId)?.muted_until,
              )}
              pinned={Boolean(pinnedAtFor(item, userId))}
              avatarPath={item.is_group ? null : other?.profiles.avatar_path}
              online={item.is_group ? undefined : other && isOnline(other.user_id)}
              unreadCount={unreadCount}
              markedUnread={Boolean(
                item.conversation_participants.find((p) => p.user_id === userId)?.marked_unread,
              )}
              isTyping={isTyping}
              preview={isTyping ? t('chat.typing') : previewText(item.messages?.[0])}
              timestamp={item.messages?.[0]?.created_at ?? null}
              draft={drafts[item.id] ?? null}
              isOpen={openRowId === item.id}
              onOpen={() => setOpenRowId(item.id)}
              onClose={() =>
                setOpenRowId((current) => (current === item.id ? null : current))
              }
              onPress={() => navigation.navigate('Chat', { conversationId: item.id, title })}
              onLongPress={() => onLongPressConversation(item, title)}
              onDelete={() => onDeleteConversation(item, title)}
            />
          );
        }}
        ListEmptyComponent={
          // Before the first load resolves there is nothing to say yet -
          // showing "no conversations" (and now a Start a chat button)
          // while the list is still arriving states something untrue.
          !hasLoadedOnce ? (
            <ConversationListSkeleton />
          ) : trimmedSearchQuery ? null : chatFilter !== 'all' ? (
            // A filter with nothing in it isn't "no conversations yet".
            <Text style={styles.filterEmpty}>
              {t(chatFilter === 'unread' ? 'conversations.filterEmptyUnread' : 'conversations.filterEmptyGroups')}
            </Text>
          ) : (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <FontAwesome6 name="comments" iconStyle="solid" size={26} color={colors.smoke} />
            </View>
            <Text style={styles.emptyTitle}>{t('conversations.noConversationsYet')}</Text>
            <Text style={styles.emptyHint}>{t('conversations.startConversationHint')}</Text>
            {/* An empty list should offer the way out of being empty,
                rather than only describing the situation. */}
            <Touchable
              style={styles.emptyAction}
              onPress={() => navigation.navigate('NewChat')}
              accessibilityRole="button"
            >
              <Text style={styles.emptyActionText}>
                {t('conversations.startFirstChat')}
              </Text>
            </Touchable>
          </View>
          )
        }
      />
      <FooterNav active="chats" />
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, paddingTop: spacing.lg },
  content: { flex: 1, width: '100%', alignSelf: 'center' },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerTitle: { fontSize: fontSizes.display, fontWeight: '800', letterSpacing: -0.3, color: colors.ink },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.paper2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper2,
  },
  filterChipSelected: { backgroundColor: colors.ember, borderColor: colors.ember },
  filterText: { fontSize: fontSizes.footnote, fontWeight: '600', color: colors.smoke },
  filterTextSelected: { color: colors.white },
  filterEmpty: {
    textAlign: 'center',
    marginTop: spacing.xxl,
    fontSize: fontSizes.footnote,
    color: colors.smoke,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: 12,
    backgroundColor: colors.paper2,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  searchInput: { flex: 1, paddingVertical: 9, fontSize: fontSizes.body, color: colors.ink },
  rowContainer: { position: 'relative', overflow: 'hidden', width: '100%' },
  deleteAction: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: SWIPE_DELETE_WIDTH,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowForeground: { width: '100%', backgroundColor: colors.paper },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
  },
  rowMain: { flex: 1, minWidth: 0 },
  sectionHeading: {
    fontSize: fontSizes.caption,
    fontWeight: '700',
    color: colors.smoke,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 4,
  },
  sectionHint: {
    fontSize: fontSizes.footnote,
    color: colors.smoke,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  hitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 9,
    paddingHorizontal: spacing.lg,
  },
  hitTitle: { fontSize: fontSizes.footnote, fontWeight: '700', color: colors.ink },
  hitBody: { fontSize: fontSizes.footnote, color: colors.smoke, marginTop: 1 },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
  },
  skeletonText: { flex: 1, gap: 7 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  // flexShrink so a long name truncates instead of pushing the time away.
  rowTitle: { flexShrink: 1, fontWeight: '700', fontSize: fontSizes.body, color: colors.ink },
  rowTime: { marginLeft: 'auto', fontSize: fontSizes.caption, color: colors.smoke },
  rowTimeUnread: { color: colors.ember, fontWeight: '700' },
  rowPreviewLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  rowPreview: { flex: 1, color: colors.smoke, fontSize: fontSizes.footnote },
  rowPreviewTyping: { color: colors.sage, fontWeight: '600' },
  rowDraftLabel: { color: colors.ember, fontWeight: '700' },
  rowPreviewUnread: { color: colors.ink, fontWeight: '600' },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.ember,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeMuted: { backgroundColor: colors.smoke },
  unreadDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.ember },
  unreadBadgeText: { color: colors.white, fontSize: fontSizes.caption, fontWeight: '700' },
  empty: { alignItems: 'center', marginTop: 64, paddingHorizontal: spacing.xxl },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.paper2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyAction: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.ember,
  },
  emptyActionText: { color: colors.white, fontWeight: '700', fontSize: fontSizes.body },
  emptyTitle: { color: colors.ink, fontWeight: '700', fontSize: fontSizes.body },
  emptyHint: { color: colors.smoke, marginTop: 4, fontSize: fontSizes.footnote },
});