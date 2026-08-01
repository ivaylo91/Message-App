import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../auth/AuthContext';
import * as conversationsData from '../data/conversations';
import { Avatar } from '../components/Avatar';
import { AppWallpaper } from '../components/AppWallpaper';
import { FooterNav } from '../components/FooterNav';
import { useContentWidth } from '../hooks/useContentWidth';
import { attachmentPreviewText } from '../utils/messagePreview';
import { spacing, ThemeColors } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';
import { Conversation, Message } from '../types';

type Props = NativeStackScreenProps<AppStackParamList, 'Notifications'>;

// A lightweight "recent activity" feed rather than a separate
// notifications system: it's just the existing conversation list
// filtered down to conversations with unread messages, reusing the
// same data ConversationsScreen already fetches.
export function NotificationsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { userId } = useAuth();
  const insets = useSafeAreaInsets();
  const { contentWidth } = useContentWidth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    if (!userId) return;
    const [data, counts] = await Promise.all([
      conversationsData.fetchConversations(userId),
      conversationsData.fetchUnreadCounts(),
    ]);
    setConversations(data);
    setUnreadCounts(counts);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const unread = conversations.filter((c) => (unreadCounts[c.id] ?? 0) > 0);

  function previewText(message: Message | undefined): string {
    if (!message) return t('conversations.noMessagesYet');
    return (
      attachmentPreviewText(message.attachment_type, message.attachment_name, t) ||
      message.body ||
      t('conversations.noMessagesYet')
    );
  }

  function conversationTitle(conversation: Conversation): string {
    if (conversation.is_group) return conversation.name ?? t('conversations.groupChat');
    const other = conversation.conversation_participants.find((p) => p.user_id !== userId);
    return (
      other?.profiles.display_name ??
      other?.profiles.email ??
      t('conversations.directMessage')
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.lg }]}>
      <AppWallpaper />
      <View style={[styles.content, { maxWidth: contentWidth }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('notifications.title')}</Text>
        </View>
        <FlatList
          data={unread}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const title = conversationTitle(item);
            const other = item.conversation_participants.find((p) => p.user_id !== userId);
            const count = unreadCounts[item.id] ?? 0;
            return (
              <TouchableOpacity
                style={styles.row}
                onPress={() => navigation.navigate('Chat', { conversationId: item.id, title })}
              >
                <Avatar
                  name={title}
                  avatarPath={item.is_group ? null : other?.profiles.avatar_path}
                />
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle}>{title}</Text>
                  <Text style={styles.rowPreview} numberOfLines={1}>
                    {previewText(item.messages?.[0])}
                  </Text>
                </View>
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>{count > 99 ? '99+' : count}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{t('notifications.emptyTitle')}</Text>
              <Text style={styles.emptyHint}>{t('notifications.emptyHint')}</Text>
            </View>
          }
        />
        <FooterNav active="notifications" />
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  content: { flex: 1, width: '100%', alignSelf: 'center' },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.3, color: colors.ink },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  rowMain: { flex: 1 },
  rowTitle: { fontWeight: '700', fontSize: 15.5, color: colors.ink },
  rowPreview: { fontSize: 13, color: colors.smoke, marginTop: 1 },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.ember,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  empty: { alignItems: 'center', marginTop: 80, paddingHorizontal: spacing.xl },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  emptyHint: { fontSize: 13.5, color: colors.smoke, textAlign: 'center' },
});
