import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
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

  function previewText(message: Message | undefined): string {
    if (!message) return t('conversations.noMessagesYet');
    return (
      attachmentPreviewText(message.attachment_type, message.attachment_name, t) ||
      message.body ||
      t('conversations.noMessagesYet')
    );
  }

  const load = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [data, counts] = await Promise.all([
        conversationsData.fetchConversations(),
        conversationsData.fetchUnreadCounts(),
      ]);
      setConversations(data);
      setUnreadCounts(counts);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

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
            <TouchableOpacity
              style={styles.row}
              onPress={() =>
                navigation.navigate('Chat', {
                  conversationId: item.id,
                  title,
                })
              }
            >
              <Avatar
                name={title}
                avatarPath={item.is_group ? null : other?.profiles.avatar_path}
                online={item.is_group ? undefined : other && isOnline(other.user_id)}
              />
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
                  {isTyping ? t('chat.typing') : previewText(item.messages?.[0])}
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