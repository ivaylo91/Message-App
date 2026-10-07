import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { FontAwesome6 } from '@react-native-vector-icons/fontawesome6/static';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../auth/AuthContext';
import { useCall } from '../calling/CallContext';
import * as conversationsData from '../data/conversations';
import { Avatar } from '../components/Avatar';
import { FooterNav } from '../components/FooterNav';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { Touchable } from '../components/Touchable';
import { useContentWidth } from '../hooks/useContentWidth';
import { formatDuration, formatListTimestamp } from '../utils/messagePreview';
import { fontSizes, spacing, ThemeColors } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';

type Props = NativeStackScreenProps<AppStackParamList, 'Calls'>;

// The Calls tab. Calls are already recorded in their conversations as
// call-summary messages (written by the caller - see CallContext), so this
// is a view across those rather than a separate history.
export function CallsScreen({ navigation }: Props) {
  const { t, i18n } = useTranslation();
  const { userId } = useAuth();
  const { startCall } = useCall();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { contentWidth } = useContentWidth();
  const [calls, setCalls] = useState<conversationsData.CallLogEntry[] | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async () => {
    setIsRefreshing(true);
    try {
      setCalls(await conversationsData.fetchCallLog());
    } catch {
      setCalls((current) => current ?? []);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // A call that just ended should be here when you come back to the tab.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const renderItem = ({ item }: { item: conversationsData.CallLogEntry }) => {
    const conversation = item.conversations;
    const other = conversation.conversation_participants.find((p) => p.user_id !== userId);
    const title = conversation.is_group
      ? conversation.name ?? t('conversations.groupChat')
      : other?.profiles.display_name ?? t('conversations.directMessage');
    const outgoing = item.sender_id === userId;
    // Missed only counts as missed for the person who was called; for the
    // caller it means nobody answered.
    const missed = item.call_status === 'missed' && !outgoing;
    const outcome =
      item.call_status === 'completed'
        ? formatDuration(Math.round((item.attachment_duration_ms ?? 0) / 1000))
        : item.call_status === 'declined'
          ? t('calls.declined')
          : outgoing
            ? t('calls.noAnswer')
            : t('calls.missed');

    return (
      <Touchable
        style={styles.row}
        onPress={() => navigation.navigate('Chat', { conversationId: item.conversation_id, title })}
        accessibilityRole="button"
      >
        <Avatar name={title} avatarPath={conversation.is_group ? null : other?.profiles.avatar_path} />
        <View style={styles.rowMain}>
          <Text style={[styles.name, missed && styles.nameMissed]} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.detail}>
            <FontAwesome6
              name={outgoing ? 'arrow-up' : 'arrow-down'}
              iconStyle="solid"
              size={10}
              color={missed ? colors.danger : colors.smoke}
              style={styles.arrow}
              accessibilityLabel={outgoing ? t('calls.outgoing') : t('calls.incoming')}
            />
            <Text style={[styles.detailText, missed && styles.detailMissed]} numberOfLines={1}>
              {outcome} · {formatListTimestamp(item.created_at, t, i18n.language)}
            </Text>
          </View>
        </View>
        {/* One-to-one only: group calls aren't supported. */}
        {!conversation.is_group && other && (
          <Touchable
            style={styles.callBack}
            iconButton
            onPress={() =>
              void startCall({
                conversationId: item.conversation_id,
                peerUserId: other.user_id,
                peerName: title,
                peerAvatarPath: other.profiles.avatar_path,
              })
            }
            accessibilityRole="button"
            accessibilityLabel={t('calls.callBack', { name: title })}
          >
            <FontAwesome6 name="video" iconStyle="solid" size={17} color={colors.ember} />
          </Touchable>
        )}
      </Touchable>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.lg }]}>
      <View style={[styles.content, { maxWidth: contentWidth }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('calls.title')}</Text>
        </View>
        {calls === null ? (
          <SkeletonGroup>
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={styles.row}>
                <Skeleton width={48} height={48} radius={24} />
                <View style={styles.rowMain}>
                  <Skeleton width="50%" height={13} />
                  <Skeleton width="35%" height={11} />
                </View>
              </View>
            ))}
          </SkeletonGroup>
        ) : (
          <FlatList
            data={calls}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={load} />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <FontAwesome6 name="video" iconStyle="solid" size={24} color={colors.smoke} />
                </View>
                <Text style={styles.emptyTitle}>{t('calls.emptyTitle')}</Text>
                <Text style={styles.emptyHint}>{t('calls.emptyHint')}</Text>
              </View>
            }
          />
        )}
      </View>
      <FooterNav active="calls" />
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    content: { flex: 1, width: '100%', alignSelf: 'center' },
    header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
    headerTitle: {
      fontSize: fontSizes.display,
      fontWeight: '800',
      letterSpacing: -0.3,
      color: colors.ink,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: 10,
      paddingHorizontal: spacing.lg,
    },
    rowMain: { flex: 1, minWidth: 0, gap: 3 },
    name: { fontSize: fontSizes.body, fontWeight: '700', color: colors.ink },
    nameMissed: { color: colors.danger },
    detail: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    // A quarter-turn makes up into ↗ (outgoing) and down into ↙ (incoming),
    // the usual way call direction is drawn.
    arrow: { transform: [{ rotate: '45deg' }] },
    detailText: { flexShrink: 1, fontSize: fontSizes.footnote, color: colors.smoke },
    detailMissed: { color: colors.danger },
    callBack: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    empty: { alignItems: 'center', marginTop: 64, paddingHorizontal: spacing.xxl, gap: spacing.sm },
    emptyIcon: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: colors.paper2,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.xs,
    },
    emptyTitle: { fontSize: fontSizes.body, fontWeight: '700', color: colors.ink },
    emptyHint: { fontSize: fontSizes.footnote, color: colors.smoke, textAlign: 'center' },
  });
