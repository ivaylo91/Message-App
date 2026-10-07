import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FontAwesome6 } from '@react-native-vector-icons/fontawesome6/static';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { AppStackParamList } from '../navigation/RootNavigator';
import { useUnread } from '../unread/UnreadContext';
import { elevation, fontSizes, radii, spacing, ThemeColors } from '../theme/tokens';
import { Touchable } from './Touchable';
import { useTheme } from '../theme/ThemeContext';

export type FooterTab = 'chats' | 'calls' | 'profile';

type SolidIconName = Extract<
  React.ComponentProps<typeof FontAwesome6>,
  { iconStyle: 'solid' }
>['name'];

interface FooterNavProps {
  active?: FooterTab;
}

// The bottom bar of the app's top-level screens - and only those: a
// conversation hides it, as every major messenger does, so the thread gets
// the height. Three real destinations. It used to also hold Notifications
// (which opened the same list as Chats), Group (an action - it now lives
// in the new-chat screen) and Exit (log out, one tap from the busiest tab
// - now at the bottom of Profile).
export function FooterNav({ active }: FooterNavProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { unreadConversationCount } = useUnread();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const items: Array<{
    key: FooterTab;
    icon: SolidIconName;
    label: string;
    onPress: () => void;
    badgeCount?: number;
  }> = [
    {
      key: 'chats',
      icon: 'comment',
      label: t('footer.chats'),
      // Conversations is the stack's root, so this goes back to it rather
      // than stacking another copy.
      onPress: () => navigation.navigate('Conversations'),
      badgeCount: unreadConversationCount,
    },
    {
      key: 'calls',
      icon: 'phone',
      label: t('footer.calls'),
      onPress: () => navigation.navigate('Calls'),
    },
    {
      key: 'profile',
      icon: 'user',
      label: t('footer.profile'),
      onPress: () => navigation.navigate('Profile'),
    },
  ];

  return (
    // A capsule floating above the screen's bottom edge, with a pill behind
    // the current tab - the shape WhatsApp's 2026 redesign and Google's
    // apps use. It stays in the layout rather than overlapping the content,
    // so no list has to pad itself to keep its last row reachable.
    <View style={[styles.container, { paddingBottom: insets.bottom + spacing.sm }]}>
      <View style={styles.bar}>
      {items.map((item) => {
        const isActive = active === item.key;
        return (
          <Touchable
            key={item.key}
            style={[styles.item, isActive && styles.itemActive]}
            iconButton
            // Tapping the tab you're on does nothing, rather than reloading.
            onPress={isActive ? undefined : item.onPress}
            accessibilityRole="button"
            // Without the count folded in, a screen reader announces
            // "Notifications" and says nothing about the 12 sitting on it.
            accessibilityLabel={
              item.badgeCount
                ? t('footer.a11yUnread', { label: item.label, count: item.badgeCount })
                : item.label
            }
            accessibilityState={{ selected: isActive }}
          >
            <View style={styles.iconWrap}>
              <FontAwesome6
                name={item.icon}
                iconStyle="solid"
                size={19}
                color={isActive ? colors.ember : colors.smoke}
              />
              {!!item.badgeCount && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText} numberOfLines={1}>
                    {item.badgeCount > 99 ? '99+' : item.badgeCount}
                  </Text>
                </View>
              )}
            </View>
            <Text
              style={[styles.label, isActive && styles.labelActive]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
          </Touchable>
        );
      })}
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xs,
      backgroundColor: colors.paper,
    },
    bar: {
      flexDirection: 'row',
      padding: 5,
      gap: 4,
      borderRadius: radii.pill,
      backgroundColor: colors.paper2,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.line,
      ...elevation.md,
    },
    item: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
      paddingVertical: 7,
      borderRadius: radii.pill,
    },
    // The ember at about 12% opacity: a tint, so the icon and label in full
    // ember stay the strongest thing on it.
    itemActive: { backgroundColor: `${colors.ember}1F` },
    iconWrap: { position: 'relative' },
    badge: {
      position: 'absolute',
      top: -5,
      right: -9,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      paddingHorizontal: 3,
      backgroundColor: colors.ember,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: colors.paper2,
    },
    badgeText: { color: colors.white, fontSize: fontSizes.micro, fontWeight: '700' },
    label: { fontSize: fontSizes.micro, fontWeight: '600', color: colors.smoke },
    labelActive: { color: colors.ember },
  });
