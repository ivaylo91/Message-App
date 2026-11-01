import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { AppStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { Touchable } from '../components/Touchable';
import * as savedMessagesData from '../data/savedMessages';
import { useContentWidth } from '../hooks/useContentWidth';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, radii, spacing, ThemeColors } from '../theme/tokens';
import { attachmentPreviewText, bodyPreviewText, formatMessageDay } from '../utils/messagePreview';

type Props = NativeStackScreenProps<AppStackParamList, 'SavedMessages'>;

export function SavedMessagesScreen({ navigation }: Props) {
  const { t, i18n } = useTranslation();
  const { userId } = useAuth();
  const { showToast } = useToast();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { contentWidth } = useContentWidth();
  const [saved, setSaved] = useState<savedMessagesData.SavedMessage[] | null>(null);

  // On every focus: messages get saved and unsaved from inside chats.
  useFocusEffect(
    useCallback(() => {
      void savedMessagesData
        .fetchSavedMessages()
        .then(setSaved)
        .catch(() => {
          setSaved((current) => current ?? []);
          showToast(t('saved.loadFailedToast'), 'error');
        });
    }, [showToast, t]),
  );

  const onRemove = useCallback(
    (messageId: string) => {
      if (!userId) return;
      setSaved((current) => current?.filter((m) => m.id !== messageId) ?? null);
      void savedMessagesData
        .unsaveMessage(userId, messageId)
        .catch(() => showToast(t('saved.saveFailedToast'), 'error'));
    },
    [userId, showToast, t],
  );

  const renderItem = ({ item }: { item: savedMessagesData.SavedMessage }) => {
    const text =
      bodyPreviewText(item.body, t) ||
      attachmentPreviewText(item.attachment_type, item.attachment_name, t) ||
      '';
    return (
      <View style={styles.row}>
        <Touchable
          style={styles.rowMain}
          onPress={() =>
            navigation.navigate('Chat', {
              conversationId: item.conversation_id,
              title: '',
              highlightMessageId: item.id,
            })
          }
          accessibilityRole="button"
        >
          <View style={styles.rowTop}>
            <Text style={styles.sender} numberOfLines={1}>
              {item.profiles?.display_name ?? ''}
            </Text>
            <Text style={styles.date}>{formatMessageDay(item.created_at, t, i18n.language)}</Text>
          </View>
          <Text style={styles.body} numberOfLines={3}>
            {text}
          </Text>
        </Touchable>
        <Touchable
          style={styles.remove}
          iconButton
          onPress={() => onRemove(item.id)}
          accessibilityRole="button"
          accessibilityLabel={t('saved.remove')}
        >
          <Icon name="xmark" size={16} color={colors.smoke} />
        </Touchable>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={[styles.content, { maxWidth: contentWidth }]}>
        <View style={styles.header}>
          <Touchable
            style={styles.backButton}
            iconButton
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel={t('chat.a11yBack')}
          >
            <Icon name="chevron-left" size={22} color={colors.ink} />
          </Touchable>
          <Text style={styles.title} accessibilityRole="header">
            {t('saved.title')}
          </Text>
        </View>

        {saved === null ? (
          <SkeletonGroup style={styles.skeleton}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} height={72} radius={radii.lg} />
            ))}
          </SkeletonGroup>
        ) : (
          <FlatList
            data={saved}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.lg }]}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Icon name="bookmark" size={26} color={colors.smoke} />
                <Text style={styles.emptyTitle}>{t('saved.emptyTitle')}</Text>
                <Text style={styles.emptyHint}>{t('saved.emptyHint')}</Text>
              </View>
            }
          />
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
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
    },
    backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    title: { fontFamily: fonts.family, fontSize: fontSizes.title, fontWeight: '800', color: colors.ink },
    skeleton: { gap: spacing.sm, paddingHorizontal: spacing.lg },
    list: { gap: spacing.sm, paddingHorizontal: spacing.lg },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: radii.lg,
      backgroundColor: colors.paper2,
    },
    rowMain: { flex: 1, minWidth: 0, gap: 2, padding: spacing.md },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    sender: { fontFamily: fonts.family, flexShrink: 1, fontSize: fontSizes.body, fontWeight: '600', color: colors.ink },
    date: { fontFamily: fonts.family, marginLeft: 'auto', fontSize: fontSizes.caption, color: colors.smoke },
    body: { fontFamily: fonts.family, fontSize: 14, lineHeight: 20, color: colors.char },
    remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    empty: { alignItems: 'center', marginTop: 80, gap: spacing.sm, paddingHorizontal: spacing.xxl },
    emptyTitle: { fontFamily: fonts.family, fontSize: fontSizes.body, fontWeight: '700', color: colors.ink },
    emptyHint: { fontFamily: fonts.family, fontSize: fontSizes.footnote, textAlign: 'center', color: colors.smoke },
  });
