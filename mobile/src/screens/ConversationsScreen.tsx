import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  PanResponder,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { FontAwesome6 } from '@react-native-vector-icons/fontawesome6/static';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import * as conversationsData from '../data/conversations';
import * as profilesData from '../data/profiles';
import { setLanguage, SUPPORTED_LANGUAGES, SupportedLanguage } from '../i18n';
import { Avatar } from '../components/Avatar';
import { AppBackground } from '../components/AppBackground';
import { useContentWidth } from '../hooks/useContentWidth';
import { usePresence } from '../presence/PresenceContext';
import { attachmentPreviewText } from '../utils/messagePreview';
import { colors, radii, spacing } from '../theme/tokens';
import { Conversation, Message, Profile } from '../types';

type Props = NativeStackScreenProps<AppStackParamList, 'Conversations'>;

const TYPING_INDICATOR_TIMEOUT_MS = 3000;
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
      <TouchableOpacity style={styles.deleteAction} onPress={onDelete}>
        <FontAwesome6 name="trash" iconStyle="solid" size={18} color={colors.white} />
      </TouchableOpacity>
      <Animated.View
        style={[styles.rowForeground, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
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
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

export function ConversationsScreen({ navigation }: Props) {
  const { t, i18n } = useTranslation();
  const { userId, logout } = useAuth();
  const { isOnline } = usePresence();
  const insets = useSafeAreaInsets();
  const { contentWidth } = useContentWidth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [ownProfile, setOwnProfile] = useState<Profile | null>(null);
  const [typingConversationIds, setTypingConversationIds] = useState<Set<string>>(
    new Set(),
  );
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  function previewText(message: Message | undefined): string {
    if (!message) return t('conversations.noMessagesYet');
    return (
      attachmentPreviewText(message.attachment_type, message.attachment_name, t) ||
      message.body ||
      t('conversations.noMessagesYet')
    );
  }

  const load = useCallback(async () => {
    if (!userId) return;
    setIsRefreshing(true);
    try {
      const [data, counts] = await Promise.all([
        conversationsData.fetchConversations(userId),
        conversationsData.fetchUnreadCounts(),
      ]);
      setConversations(data);
      setUnreadCounts(counts);
    } finally {
      setIsRefreshing(false);
    }
  }, [userId]);

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

  // Listen for the same per-conversation typing broadcast ChatScreen sends
  // (see ChatScreen.tsx), so "typing..." can show in the list before a
  // chat is even opened - one lightweight channel per visible conversation,
  // broadcast-only (no postgres_changes).
  useEffect(() => {
    if (!userId || conversations.length === 0) return;
    const timeouts = new Map<string, ReturnType<typeof setTimeout>>();

    const channels = conversations.map((conversation) =>
      supabase
        .channel(`messages:${conversation.id}`, { config: { private: true } })
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          if (payload.userId === userId) return;
          setTypingConversationIds((current) => new Set(current).add(conversation.id));
          const existing = timeouts.get(conversation.id);
          if (existing) clearTimeout(existing);
          timeouts.set(
            conversation.id,
            setTimeout(() => {
              setTypingConversationIds((current) => {
                const next = new Set(current);
                next.delete(conversation.id);
                return next;
              });
            }, TYPING_INDICATOR_TIMEOUT_MS),
          );
        })
        .subscribe(),
    );

    return () => {
      for (const timeout of timeouts.values()) clearTimeout(timeout);
      for (const channel of channels) void supabase.removeChannel(channel);
    };
  }, [conversations, userId]);

  // Bumps the unread badge live for any conversation the user is in (RLS
  // scopes delivery to those, same as the messages table's select policy),
  // so a new message shows up without waiting for a pull-to-refresh. The
  // read side resets naturally: opening a chat calls markConversationRead,
  // and coming back re-fetches counts via the useFocusEffect above.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('unread-messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const incoming = payload.new as Message;
          if (incoming.sender_id === userId) return;
          setUnreadCounts((current) => ({
            ...current,
            [incoming.conversation_id]: (current[incoming.conversation_id] ?? 0) + 1,
          }));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

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

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.lg }]}>
      <AppBackground />
      <View style={[styles.content, { maxWidth: contentWidth }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
            <Avatar
              name={ownProfile?.display_name || ownProfile?.email || '?'}
              avatarPath={ownProfile?.avatar_path}
              size={40}
              online={userId ? isOnline(userId) : undefined}
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('conversations.title')}</Text>
        </View>
        <View style={styles.headerActions}>
          {SUPPORTED_LANGUAGES.map((lang: SupportedLanguage) => (
            <TouchableOpacity
              key={lang}
              style={[
                styles.languageChip,
                i18n.language === lang && styles.languageChipActive,
              ]}
              onPress={() => void setLanguage(lang)}
            >
              <Text
                style={[
                  styles.languageChipText,
                  i18n.language === lang && styles.languageChipTextActive,
                ]}
              >
                {lang.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => navigation.navigate('NewChat')}
          >
            <FontAwesome6 name="pen-to-square" iconStyle="solid" size={15} color={colors.ink} />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={conversations}
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
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{t('conversations.noConversationsYet')}</Text>
            <Text style={styles.emptyHint}>{t('conversations.startConversationHint')}</Text>
          </View>
        }
      />
      <TouchableOpacity
        style={[styles.logoutButton, { paddingBottom: insets.bottom + spacing.md }]}
        onPress={() => void logout()}
      >
        <FontAwesome6
          name="right-from-bracket"
          iconStyle="solid"
          size={13}
          color={colors.smoke}
        />
        <Text style={styles.logoutText}>{t('conversations.logout')}</Text>
      </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  headerTitle: { fontSize: 28, fontWeight: '800', letterSpacing: -0.3, color: colors.ink },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  languageChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
  },
  languageChipActive: { backgroundColor: colors.ember, borderColor: colors.ember },
  languageChipText: { fontSize: 11, fontWeight: '700', color: colors.smoke },
  languageChipTextActive: { color: colors.white },
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
  rowTitle: { fontWeight: '700', fontSize: 15.5, color: colors.ink },
  rowPreview: { color: colors.smoke, marginTop: 2, fontSize: 13.5 },
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
  unreadBadgeText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  empty: { alignItems: 'center', marginTop: 64, paddingHorizontal: spacing.xxl },
  emptyTitle: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  emptyHint: { color: colors.smoke, marginTop: 4, fontSize: 13.5 },
  logoutButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  logoutText: { color: colors.smoke, fontWeight: '600', fontSize: 13.5 },
});