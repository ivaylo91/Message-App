import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../components/Icon';
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
import { formatDuration, formatMessageDay, formatMessageTime } from '../utils/messagePreview';
import { groupCallLog, type CallLogRow } from '../utils/callLog';
import { fonts, fontSizes, MAX_FONT_SCALE_TIGHT, spacing, ThemeColors } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';

type Props = NativeStackScreenProps<AppStackParamList, 'Calls'>;

type CallFilter = 'all' | 'missed';
type Row = CallLogRow<conversationsData.CallLogEntry>;

// The Calls tab. Calls are already recorded in their conversations as
// call-summary messages (written by the caller - see CallContext), so this
// is a view across those rather than a separate history. Grouped by day,
// each day a card; repeated tries at one person collapse into one row.
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
  const [filter, setFilter] = useState<CallFilter>('all');

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

  const days = useMemo(() => groupCallLog(calls ?? [], userId), [calls, userId]);
  const sections = useMemo(
    () =>
      days
        .map((day) => ({
          key: day.date,
          title: formatMessageDay(day.date, t, i18n.language),
          data: filter === 'all' ? day.rows : day.rows.filter((r) => r.direction === 'missed'),
        }))
        .filter((section) => section.data.length > 0),
    [days, filter, t, i18n.language],
  );
  const missedCount = useMemo(
    () =>
      days.reduce(
        (sum, day) =>
          sum + day.rows.filter((r) => r.direction === 'missed').reduce((n, r) => n + r.count, 0),
        0,
      ),
    [days],
  );

  const renderItem = ({
    item,
    index,
    section,
  }: {
    item: Row;
    index: number;
    section: { data: readonly Row[] };
  }) => {
    const { entry, direction, count } = item;
    const conversation = entry.conversations;
    const other = conversation.conversation_participants.find((p) => p.user_id !== userId);
    const title = conversation.is_group
      ? conversation.name ?? t('conversations.groupChat')
      : other?.profiles.display_name ?? t('conversations.directMessage');
    const missed = direction === 'missed';
    const outcome =
      entry.call_status === 'completed'
        ? formatDuration(Math.round((entry.attachment_duration_ms ?? 0) / 1000))
        : entry.call_status === 'declined'
          ? t('calls.declined')
          : direction === 'outgoing'
            ? t('calls.noAnswer')
            : t('calls.missed');

    return (
      <Touchable
        style={[
          styles.row,
          index > 0 && styles.rowDivided,
          index === 0 && styles.rowFirst,
          index === section.data.length - 1 && styles.rowLast,
        ]}
        onPress={() => navigation.navigate('Chat', { conversationId: entry.conversation_id, title })}
        accessibilityRole="button"
      >
        <Avatar
          name={title}
          avatarPath={conversation.is_group ? null : other?.profiles.avatar_path}
          size={44}
          shape={conversation.is_group ? 'rounded' : 'circle'}
        />
        <View style={styles.rowMain}>
          <View style={styles.nameLine}>
            <Text style={styles.name} numberOfLines={1}>
              {title}
            </Text>
            {count > 1 && <Text style={styles.count}>({count})</Text>}
          </View>
          <View style={styles.detail}>
            <Icon
              name={direction === 'outgoing' ? 'arrow-up-right' : 'arrow-down-left'}
              size={14}
              color={missed ? colors.danger : colors.smoke}
              accessibilityLabel={direction === 'outgoing' ? t('calls.outgoing') : t('calls.incoming')}
            />
            <Text style={[styles.detailText, missed && styles.detailMissed]} numberOfLines={1}>
              {outcome}
            </Text>
            <Text style={styles.detailDot} importantForAccessibility="no">
              ·
            </Text>
            <Text style={styles.detailTime}>{formatMessageTime(entry.created_at, i18n.language)}</Text>
          </View>
        </View>
        {/* One-to-one only: group calls aren't supported. */}
        {!conversation.is_group && other && (
          <Touchable
            style={styles.callBack}
            iconButton
            onPress={() =>
              void startCall({
                conversationId: entry.conversation_id,
                peerUserId: other.user_id,
                peerName: title,
                peerAvatarPath: other.profiles.avatar_path,
              })
            }
            accessibilityRole="button"
            accessibilityLabel={t('calls.callBack', { name: title })}
          >
            <Icon name="video" size={20} color={colors.emberText} />
          </Touchable>
        )}
      </Touchable>
    );
  };

  const tabs: { key: CallFilter; label: string; count: number }[] = [
    { key: 'all', label: t('calls.filterAll'), count: 0 },
    { key: 'missed', label: t('calls.filterMissed'), count: missedCount },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.lg }]}>
      <View style={[styles.content, { maxWidth: contentWidth }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('calls.title')}</Text>
        </View>
        <View style={styles.segmented} accessibilityRole="tablist">
          {tabs.map((tab) => {
            const selected = tab.key === filter;
            return (
              <Touchable
                key={tab.key}
                style={[styles.segment, selected && styles.segmentSelected]}
                onPress={() => setFilter(tab.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={tab.count > 0 ? `${tab.label}, ${tab.count}` : tab.label}
              >
                <Text
                  style={[styles.segmentText, selected && styles.segmentTextSelected]}
                  maxFontSizeMultiplier={MAX_FONT_SCALE_TIGHT}
                >
                  {tab.label}
                </Text>
                {tab.count > 0 && (
                  <View style={styles.segmentBadge}>
                    <Text style={styles.segmentBadgeText} maxFontSizeMultiplier={MAX_FONT_SCALE_TIGHT}>
                      {tab.count > 99 ? '99+' : tab.count}
                    </Text>
                  </View>
                )}
              </Touchable>
            );
          })}
        </View>
        {calls === null ? (
          <SkeletonGroup>
            <View style={styles.card}>
              {Array.from({ length: 5 }).map((_, i) => (
                <View key={i} style={styles.row}>
                  <Skeleton width={44} height={44} radius={22} />
                  <View style={styles.rowMain}>
                    <Skeleton width="50%" height={13} />
                    <Skeleton width="35%" height={11} />
                  </View>
                </View>
              ))}
            </View>
          </SkeletonGroup>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.entry.id}
            renderItem={renderItem}
            stickySectionHeadersEnabled={false}
            renderSectionHeader={({ section }) => (
              <Text style={styles.sectionTitle}>{section.title}</Text>
            )}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={load} />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <Icon name="video" size={24} color={colors.smoke} />
                </View>
                <Text style={styles.emptyTitle}>
                  {filter === 'missed' ? t('calls.emptyMissedTitle') : t('calls.emptyTitle')}
                </Text>
                {filter === 'all' && <Text style={styles.emptyHint}>{t('calls.emptyHint')}</Text>}
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
    header: { paddingHorizontal: spacing.lg + 4, paddingBottom: spacing.lg },
    headerTitle: {
      fontSize: 30,
      fontFamily: fonts.family,
      fontWeight: '800',
      letterSpacing: -0.9,
      color: colors.ink,
    },
    // A sunken track with the selected segment raised out of it.
    segmented: {
      flexDirection: 'row',
      gap: 4,
      padding: 4,
      marginHorizontal: spacing.lg + 4,
      borderRadius: 14,
      backgroundColor: colors.fill,
    },
    segment: {
      flex: 1,
      minHeight: 38,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderRadius: 11,
    },
    segmentSelected: {
      backgroundColor: colors.paper2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.12,
      shadowRadius: 3,
      elevation: 1,
    },
    segmentText: { fontFamily: fonts.family, fontSize: 14, fontWeight: '600', color: colors.smoke },
    segmentTextSelected: { color: colors.ink },
    segmentBadge: {
      minWidth: 18,
      height: 18,
      paddingHorizontal: 5,
      borderRadius: 9,
      backgroundColor: colors.dangerFill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentBadgeText: { fontFamily: fonts.family, fontSize: fontSizes.caption, fontWeight: '700', color: '#FFFFFF' },
    listContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg },
    sectionTitle: {
      fontFamily: fonts.family,
      fontSize: fontSizes.footnote,
      fontWeight: '600',
      letterSpacing: 0.26,
      color: colors.smoke,
      marginTop: spacing.lg,
      marginBottom: 6,
      marginHorizontal: spacing.sm,
    },
    card: {
      marginTop: spacing.lg,
      marginHorizontal: spacing.md,
      borderRadius: 20,
      backgroundColor: colors.paper2,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: 10,
      paddingLeft: spacing.md,
      paddingRight: 10,
      backgroundColor: colors.paper2,
    },
    // Each day is one card: the rows draw its fill, the first and last
    // round its corners.
    rowFirst: { borderTopLeftRadius: 20, borderTopRightRadius: 20 },
    rowLast: { borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
    rowDivided: { borderTopWidth: 1, borderTopColor: colors.fill },
    rowMain: { flex: 1, minWidth: 0, gap: 2 },
    nameLine: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
    name: { fontFamily: fonts.family, flexShrink: 1, fontSize: 16, fontWeight: '600', color: colors.ink },
    count: { fontFamily: fonts.family, fontSize: 14, fontWeight: '500', color: colors.smoke },
    detail: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    detailText: { fontFamily: fonts.family, flexShrink: 1, fontSize: 14, color: colors.smoke },
    detailMissed: { color: colors.danger, fontWeight: '600' },
    detailDot: { fontFamily: fonts.family, fontSize: 14, color: colors.line },
    detailTime: { fontFamily: fonts.family, fontSize: 14, color: colors.smoke },
    callBack: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.emberTint,
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
    emptyTitle: { fontFamily: fonts.family, fontSize: fontSizes.body, fontWeight: '700', color: colors.ink },
    emptyHint: { fontFamily: fonts.family, fontSize: fontSizes.footnote, color: colors.smoke, textAlign: 'center' },
  });
