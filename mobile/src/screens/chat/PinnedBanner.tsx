import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../components/Icon';
import { Touchable } from '../../components/Touchable';
import { useTheme } from '../../theme/ThemeContext';
import { fonts, fontSizes, spacing, ThemeColors } from '../../theme/tokens';
import { attachmentPreviewText } from '../../utils/messagePreview';
import { Message } from '../../types';

// The pinned message, under the chat header. Tapping jumps to it in the thread.
export function PinnedBanner({
  message,
  onPress,
  onUnpin,
}: {
  message: Message;
  onPress: () => void;
  // Absent for someone who can't unpin it.
  onUnpin?: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const text =
    message.body ||
    attachmentPreviewText(message.attachment_type, message.attachment_name, t) ||
    '';

  return (
    <View style={styles.bar}>
      <Touchable
        style={styles.main}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${t('chat.pinnedMessage')}: ${text}`}
      >
        <Icon name="thumbtack" size={15} color={colors.emberText} />
        <Text style={styles.text} numberOfLines={1}>
          {text}
        </Text>
      </Touchable>
      {onUnpin && (
        <Touchable
          style={styles.unpin}
          iconButton
          onPress={onUnpin}
          accessibilityRole="button"
          accessibilityLabel={t('chat.unpinMessage')}
        >
          <Icon name="xmark" size={15} color={colors.smoke} />
        </Touchable>
      )}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.paper2,
      borderBottomWidth: 1,
      borderBottomColor: colors.fill,
    },
    main: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 44,
      paddingHorizontal: spacing.lg,
    },
    text: { fontFamily: fonts.family, flexShrink: 1, fontSize: fontSizes.footnote, color: colors.char },
    unpin: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  });
