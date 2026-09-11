import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  LayoutAnimation,
  PanResponder,
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
import { Avatar } from '../components/Avatar';
import { Touchable } from '../components/Touchable';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { AppLogo } from '../components/AppLogo';
import { FooterNav } from '../components/FooterNav';
import { useContentWidth } from '../hooks/useContentWidth';
import { usePresence } from '../presence/PresenceContext';
import { useUnread } from '../unread/UnreadContext';
import { useTyping } from '../typing/TypingContext';
import { useMessageStream } from '../messages/MessageStreamContext';
import { attachmentPreviewText, callStatusPreviewText } from '../utils/messagePreview';
import { applyIncomingMessage } from '../utils/conversationList';
import { fontSizes, radii, spacing, ThemeColors } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';
import { Conversation, Message, Profile } from '../types';

type Props = NativeStackScreenProps<AppStackParamList, 'Conversations'>;

const SWIPE_DELETE_WIDTH = 84;
const SWIPE_OPEN_THRESHOLD = -40;

interface ConversationRowProps {
  title: string;
  avatarPath: string | null | undefined;
  online: boolean | undefined;
  unreadCount: number;
  isTyping: boolean;
  preview: string;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onPress: () => void;
  onDelete: () => void;
}

// Swipe-to-delete via core RN Animated/PanResponder rather than a gesture
// library - a plain horizontal drag that reveals a Delete action underneath
// is well within what PanResponder handles on its own. Only one row's
// delete action is open at a time (isOpen/onOpen/onClose, coordinated by
// the parent), matching the usual Mail/WhatsApp-style swipe list feel.
function ConversationRow({
  title,
  avatarPath,
  online,
  unreadCount,
  isTyping,
  preview,
  isOpen,
  onOpen,
  onClose,
  onPress,
  onDelete,
}: ConversationRowProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const translateX = useRef(new Animated.Value(0)).current;
  const openXRef = useRef(0);

  useEffect(() => {
    if (!isOpen && openXRef.current !== 0) {
      openXRef.current = 0;
      Animated.timing(translateX, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [isOpen, translateX]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      onPanResponderGrant: onOpen,
      onPanResponderMove: (_, gesture) => {
        const next = Math.max(-SWIPE_DELETE_WIDTH, Math.min(0, openXRef.current + gesture.dx));
        translateX.setValue(next);
      },
      onPanResponderRelease: (_, gesture) => {
        const projected = Math.max(
          -SWIPE_DELETE_WIDTH,
          Math.min(0, openXRef.current + gesture.dx),
        );
        const shouldOpen = projected < SWIPE_OPEN_THRESHOLD;
        openXRef.current = shouldOpen ? -SWIPE_DELETE_WIDTH : 0;
        Animated.timing(translateX, {
          toValue: openXRef.current,
          duration: 200,
          useNativeDriver: true,
        }).start();
        if (!shouldOpen) onClose();
      },
    }),
  ).current;

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
      <Animated.View
        style={[styles.rowForeground, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <Touchable style={styles.row} onPress={onPress}>
          <Avatar name={title} avatarPath={avatarPath} online={online} />
          <View style={styles.rowMain}>
            <Text style={styles.rowTitle}>{title}</Text>
            <Text
              style={[
                styles.rowPreview,
                isTyping && styles.rowPreviewTyping,
                !isTyping && unreadCount > 0 && styles.rowPreviewUnread,
              ]}
              numberOfLines={1}
            >
              {preview}
            </Text>
          </View>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          )}
        </Touchable>
      </Animated.View>
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
  const { unreadCounts, refresh: refreshUnreadCounts } = useUnread();
  const { typingConversationIds, watch: watchTyping } = useTyping();
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

  const onDeleteConversation = useCallback(
    (conversation: Conversation, title: string) => {
      Alert.alert(
        t('conversations.deleteConfirmTitle'),
        t('conversations.deleteConfirmMessage', { name: title }),
        [
          { text: t('chat.cancel'), style: 'cancel', onPress: () => setOpenRowId(null) },
          {
            text: t('conversations.delete'),
            style: 'destructive',
            onPress: () => {
              if (!userId) return;
              setConversations((current) => current.filter((c) => c.id !== conversation.id));
              conversationsData.hideConversation(conversation.id, userId).catch(() => {
                // best-effort - a failed hide just leaves the row visible after next refresh
              });
            },
          },
        ],
      );
    },
    [t, userId],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

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

  const otherParticipantOf = (conversation: Conversation) =>
    conversation.conversation_participants.find((p) => p.user_id !== userId);

  const conversationTitle = (conversation: Conversation) => {
    if (conversation.is_group)
      return conversation.name ?? t('conversations.groupChat');
    const other = otherParticipantOf(conversation);
    return (
      other?.profiles.display_name ??
      other?.profiles.email ??
      t('conversations.directMessage')
    );
  };

  // Plain client-side filter over the already-loaded list, matched
  // against both the row's title and its last-message preview - the same
  // two things ConversationRow renders, so a match always makes sense to
  // the person reading the results.
  const trimmedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredConversations = trimmedSearchQuery
    ? conversations.filter((conversation) => {
        const title = conversationTitle(conversation).toLowerCase();
        const preview = previewText(conversation.messages?.[0]).toLowerCase();
        return title.includes(trimmedSearchQuery) || preview.includes(trimmedSearchQuery);
      })
    : conversations;

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
              name={ownProfile?.display_name || ownProfile?.email || '?'}
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
          onChangeText={setSearchQuery}
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

      <FlatList
        data={filteredConversations}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={load} />
        }
        renderItem={({ item }) => {
          const title = conversationTitle(item);
          const other = otherParticipantOf(item);
          const isTyping = typingConversationIds.has(item.id);
          const unreadCount = unreadCounts[item.id] ?? 0;
          return (
            <ConversationRow
              title={title}
              avatarPath={item.is_group ? null : other?.profiles.avatar_path}
              online={item.is_group ? undefined : other && isOnline(other.user_id)}
              unreadCount={unreadCount}
              isTyping={isTyping}
              preview={isTyping ? t('chat.typing') : previewText(item.messages?.[0])}
              isOpen={openRowId === item.id}
              onOpen={() => setOpenRowId(item.id)}
              onClose={() =>
                setOpenRowId((current) => (current === item.id ? null : current))
              }
              onPress={() => navigation.navigate('Chat', { conversationId: item.id, title })}
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
          ) : (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <FontAwesome6
                name={trimmedSearchQuery ? 'magnifying-glass' : 'comments'}
                iconStyle="solid"
                size={26}
                color={colors.smoke}
              />
            </View>
            {trimmedSearchQuery ? (
              <Text style={styles.emptyTitle}>{t('conversations.noSearchResults')}</Text>
            ) : (
              <>
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
              </>
            )}
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
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
  },
  skeletonText: { flex: 1, gap: 7 },
  rowTitle: { fontWeight: '700', fontSize: fontSizes.body, color: colors.ink },
  rowPreview: { color: colors.smoke, marginTop: 2, fontSize: fontSizes.footnote },
  rowPreviewTyping: { color: colors.sage, fontWeight: '600' },
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