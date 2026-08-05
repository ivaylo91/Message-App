import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FontAwesome6 } from '@react-native-vector-icons/fontawesome6/static';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { AppStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../auth/AuthContext';
import { useUnread } from '../unread/UnreadContext';
import { spacing, ThemeColors } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';

export type FooterTab = 'notifications' | 'chats' | 'group' | 'exit';

type SolidIconName = Extract<
  React.ComponentProps<typeof FontAwesome6>,
  { iconStyle: 'solid' }
>['name'];

interface FooterNavProps {
  active?: FooterTab;
}

// A persistent bottom bar for the app's main screens (Conversations,
// Chat) - self-contained so any screen can just drop in
// <FooterNav active="..." /> without wiring up navigation/logout itself.
// The Notifications tab currently just opens the main chat list (all
// chats) rather than a separate filtered screen.
export function FooterNav({ active }: FooterNavProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { logout } = useAuth();
  const { totalUnread } = useUnread();
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
      key: 'notifications',
      icon: 'bell',
      label: t('footer.notifications'),
      onPress: () => navigation.navigate('Conversations'),
    },
    {
      key: 'chats',
      icon: 'comment',
      label: t('footer.chats'),
      onPress: () => navigation.navigate('Conversations'),
      badgeCount: totalUnread,
    },
    {
      key: 'group',
      icon: 'users',
      label: t('footer.group'),
      onPress: () => navigation.navigate('NewGroup'),
    },
    {
      key: 'exit',
      icon: 'right-from-bracket',
      label: t('footer.exit'),
      onPress: () => void logout(),
    },
  ];

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + spacing.xs }]}>
      {items.map((item) => {
        const isActive = active === item.key;
        return (
          <TouchableOpacity
            key={item.key}
            style={styles.item}
            onPress={item.onPress}
            activeOpacity={0.6}
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
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      borderTopWidth: 1,
      borderTopColor: colors.line,
      backgroundColor: colors.paper2,
      paddingTop: spacing.sm,
    },
    item: { flex: 1, alignItems: 'center', gap: 3 },
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
    badgeText: { color: colors.white, fontSize: 9.5, fontWeight: '700' },
    label: { fontSize: 10.5, fontWeight: '600', color: colors.smoke },
    labelActive: { color: colors.ember },
  });
