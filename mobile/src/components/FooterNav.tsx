import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { AppStackParamList } from '../navigation/RootNavigator';
import { useUnread } from '../unread/UnreadContext';
import {
  elevation,
  fonts,
  fontSizes,
  MAX_FONT_SCALE_TIGHT,
  spacing,
  ThemeColors,
} from '../theme/tokens';
import { Touchable } from './Touchable';
import { useTheme } from '../theme/ThemeContext';

export type FooterTab = 'chats' | 'calls' | 'profile';

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

  // Tabs are peers, so switching never builds up history: the stack is
  // Chats, plus at most one other tab on top, and Back from either of those
  // lands on Chats. A plain navigate() can't do this - it pushes a new copy
  // of any screen that isn't the current one.
  const switchTo = (route: 'Calls' | 'Profile') =>
    active === 'chats' ? navigation.navigate(route) : navigation.replace(route);

  const items: Array<{
    key: FooterTab;
    icon: IconName;
    label: string;
    onPress: () => void;
    badgeCount?: number;
    // Profile is icon-only in the bar, as in the redesign; the label
    // still goes to screen readers.
    iconOnly?: boolean;
  }> = [
    {
      key: 'chats',
      icon: 'comment',
      label: t('footer.chats'),
      onPress: () => navigation.popTo('Conversations'),
      badgeCount: unreadConversationCount,
    },
    {
      key: 'calls',
      icon: 'phone',
      label: t('footer.calls'),
      onPress: () => switchTo('Calls'),
    },
    {
      key: 'profile',
      icon: 'user',
      label: t('footer.profile'),
      onPress: () => switchTo('Profile'),
      iconOnly: true,
    },
  ];

  return (
    // An inverse capsule floating above the screen's bottom edge - vermilion on
    // the light theme, light on the dark one - with the current tab lifted
    // out in the page colour. It stays in the layout rather than
    // overlapping the content, so no list has to pad itself to keep its
    // last row reachable.
    <View style={[styles.container, { paddingBottom: insets.bottom + spacing.sm }]}>
      <View style={styles.bar}>
      {items.map((item) => {
        const isActive = active === item.key;
        return (
          <Touchable
            key={item.key}
            style={[styles.item, item.iconOnly && styles.itemIconOnly, isActive && styles.itemActive]}
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
              <Icon
                name={item.icon}
                size={20}
                color={isActive ? colors.navActiveText : colors.navText}
              />
              {!!item.badgeCount && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE_TIGHT}>
                    {item.badgeCount > 99 ? '99+' : item.badgeCount}
                  </Text>
                </View>
              )}
            </View>
            {!item.iconOnly && (
              <Text
                style={[styles.label, isActive && styles.labelActive]}
                maxFontSizeMultiplier={MAX_FONT_SCALE_TIGHT}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            )}
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
      paddingHorizontal: spacing.lg + 4,
      paddingTop: spacing.xs,
      backgroundColor: colors.paper,
    },
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 68,
      paddingHorizontal: spacing.sm,
      gap: 4,
      borderRadius: 24,
      backgroundColor: colors.navBar,
      ...elevation.lg,
    },
    item: {
      flex: 1,
      height: 52,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      // Clears the unread badge, which hangs off the icon's corner.
      gap: spacing.md,
      borderRadius: 18,
    },
    itemIconOnly: { flex: 0, width: 64 },
    itemActive: { backgroundColor: colors.navActive },
    iconWrap: { position: 'relative' },
    badge: {
      position: 'absolute',
      top: -6,
      right: -9,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 4,
      backgroundColor: colors.navBadge,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.navBar,
    },
    badgeText: { fontFamily: fonts.family, color: colors.navBadgeText, fontSize: fontSizes.micro, fontWeight: '700' },
    label: { fontFamily: fonts.family, fontSize: 14, fontWeight: '500', color: colors.navText },
    labelActive: { fontWeight: '600', color: colors.navActiveText },
  });
