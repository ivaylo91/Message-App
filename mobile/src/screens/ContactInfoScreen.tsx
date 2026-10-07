import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../components/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../auth/AuthContext';
import * as conversationsData from '../data/conversations';
import { Avatar } from '../components/Avatar';
import { Touchable } from '../components/Touchable';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { useContentWidth } from '../hooks/useContentWidth';
import { useMuteChooser } from '../hooks/useMuteChooser';
import { usePresence } from '../presence/PresenceContext';
import { useCall } from '../calling/CallContext';
import { formatLastSeen } from '../utils/messagePreview';
import { isMuted } from '../utils/mute';
import { fonts, fontSizes, radii, spacing, ThemeColors } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';
import { Conversation } from '../types';

type Props = NativeStackScreenProps<AppStackParamList, 'ContactInfo'>;

// The other person in a one-to-one chat - what tapping their name in the
// chat header opens, as GroupInfo is for a group. Block and Report stay in
// the chat's own menu, where their confirmation and reason sheets live.
export function ContactInfoScreen({ route, navigation }: Props) {
  const { conversationId } = route.params;
  const { t } = useTranslation();
  const { userId } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { contentWidth } = useContentWidth();
  const { isOnline } = usePresence();
  const { startCall } = useCall();
  const chooseMute = useMuteChooser();
  const [conversation, setConversation] = useState<Conversation | null>(null);

  useEffect(() => {
    void conversationsData
      .fetchConversation(conversationId)
      .then(setConversation)
      .catch(() => {});
  }, [conversationId]);

  const other = conversation?.conversation_participants.find((p) => p.user_id !== userId);
  const mine = conversation?.conversation_participants.find((p) => p.user_id === userId);
  const muted = isMuted(mine?.muted_until);
  const name = other?.profiles.display_name ?? '';

  const status = !other
    ? null
    : isOnline(other.user_id)
      ? t('chat.online')
      : other.profiles.show_last_seen === false
        ? null
        : formatLastSeen(other.profiles.last_seen_at, t);

  const onToggleMute = useCallback(() => {
    void chooseMute(conversationId, name, mine?.muted_until).then((mutedUntil) => {
      if (mutedUntil === undefined) return;
      setConversation((current) =>
        current && {
          ...current,
          conversation_participants: current.conversation_participants.map((p) =>
            p.user_id === userId ? { ...p, muted_until: mutedUntil } : p,
          ),
        },
      );
    });
  }, [chooseMute, conversationId, name, mine?.muted_until, userId]);

  const actions = other
    ? [
        {
          id: 'call',
          icon: 'video' as const,
          label: t('contactInfo.call'),
          onPress: () =>
            void startCall({
              conversationId,
              peerUserId: other.user_id,
              peerName: name,
              peerAvatarPath: other.profiles.avatar_path,
            }),
        },
        {
          id: 'media',
          icon: 'images' as const,
          label: t('contactInfo.media'),
          onPress: () => navigation.navigate('MediaGallery', { conversationId, title: name }),
        },
        {
          id: 'mute',
          icon: muted ? ('bell' as const) : ('bell-slash' as const),
          label: muted ? t('conversations.unmute') : t('contactInfo.mute'),
          onPress: onToggleMute,
        },
      ]
    : [];

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      <View style={[styles.content, { maxWidth: contentWidth }]}>
        <View style={styles.header}>
          <Touchable
            style={styles.backButton}
            iconButton
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel={t('chat.a11yBack')}
          >
            <Icon name="chevron-left" size={18} color={colors.ink} />
          </Touchable>
          <Text style={styles.headerTitle}>{t('contactInfo.title')}</Text>
        </View>

        {!other ? (
          <SkeletonGroup style={styles.profile}>
            <Skeleton width={104} height={104} radius={52} />
            <Skeleton width={160} height={20} />
            <Skeleton width={100} height={13} />
          </SkeletonGroup>
        ) : (
          <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: spacing.xxl + insets.bottom }]}>
            <View style={styles.profile}>
              <Avatar
                name={name}
                avatarPath={other.profiles.avatar_path}
                size={104}
                online={isOnline(other.user_id)}
              />
              <Text style={styles.name}>{name}</Text>
              {other.profiles.username && (
                <Text style={styles.username}>@{other.profiles.username}</Text>
              )}
              {status && <Text style={styles.status}>{status}</Text>}
            </View>

            <View style={styles.actions}>
              {actions.map((action) => (
                <Touchable
                  key={action.id}
                  style={styles.action}
                  onPress={action.onPress}
                  pressScale
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                >
                  <Icon
                    name={action.icon}
                    size={18}
                    color={colors.emberText}
                  />
                  <Text style={styles.actionLabel} numberOfLines={1}>
                    {action.label}
                  </Text>
                </Touchable>
              ))}
            </View>
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    content: { flex: 1, width: '100%', alignSelf: 'center' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
    },
    backButton: { width: 30, alignItems: 'flex-start' },
    headerTitle: { fontSize: fontSizes.title, fontFamily: fonts.display, color: colors.ink },
    scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
    profile: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.lg },
    name: {
      marginTop: spacing.md,
      fontSize: fontSizes.title,
      fontFamily: fonts.display,
      color: colors.ink,
      textAlign: 'center',
    },
    username: { fontSize: fontSizes.body, color: colors.smoke },
    status: { fontSize: fontSizes.footnote, color: colors.smoke },
    actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    action: {
      flex: 1,
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.md,
      borderRadius: radii.lg,
      backgroundColor: colors.paper2,
    },
    actionLabel: { fontSize: fontSizes.footnote, fontWeight: '600', color: colors.ink },
  });
