import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import LinearGradient from 'react-native-linear-gradient';
import { Icon } from '../components/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { setLanguage, SUPPORTED_LANGUAGES, SupportedLanguage } from '../i18n';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import * as profilesData from '../data/profiles';
import {
  getNotificationPermission,
  openNotificationSettings,
  requestPermissionAndRegisterToken,
  type NotificationPermission,
} from '../notifications';
import { Avatar } from '../components/Avatar';
import { Touchable } from '../components/Touchable';
import { PasswordField } from '../components/PasswordField';
import { useConfirm } from '../components/ConfirmSheet';
import { useContentWidth } from '../hooks/useContentWidth';
import { usePresence } from '../presence/PresenceContext';
import {
  BUBBLE_GRADIENT_PRESETS,
  elevation,
  fonts,
  fontSizes,
  radii,
  spacing,
  ThemeColors,
  ThemePreference,
} from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';
import { OwnProfile } from '../types';

type Props = NativeStackScreenProps<AppStackParamList, 'Profile'>;

const THEME_PREFERENCES: ThemePreference[] = ['system', 'light', 'dark'];
// The colours each theme card draws itself with - fixed, so the Dark
// card looks dark while the app is light and the other way round.
const THEME_PREVIEWS: Record<ThemePreference, { bg: string; line: string }> = {
  system: { bg: '#E9E1D7', line: '#B9AEA5' },
  light: { bg: '#FAF5EF', line: '#D9CEC4' },
  dark: { bg: '#1C1613', line: '#4A3F38' },
};

const THEME_PREFERENCE_LABEL_KEYS: Record<ThemePreference, string> = {
  system: 'profile.themeSystem',
  light: 'profile.themeLight',
  dark: 'profile.themeDark',
};

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;
// Hosted from docs/privacy-policy.html - requires GitHub Pages enabled on
// this repo (Settings > Pages > Deploy from a branch > main > /docs).
const PRIVACY_POLICY_URL = 'https://ivaylo91.github.io/Message-App/privacy-policy.html';
const PHONE_PATTERN = /^\+?[0-9]{7,15}$/;

export function ProfileScreen({ navigation }: Props) {
  const { t, i18n } = useTranslation();
  const { userId, logout } = useAuth();
  const { confirm } = useConfirm();
  const { setSharesLastSeen } = usePresence();
  const insets = useSafeAreaInsets();
  const { contentWidth } = useContentWidth();
  const {
    colors,
    scheme,
    bubbleGradientId,
    setBubbleGradientId,
    themePreference,
    setThemePreference,
    chatWallpaper,
    setChatWallpaper,
  } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isPasswordPromptVisible, setIsPasswordPromptVisible] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deletePasswordError, setDeletePasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    void profilesData.fetchOwnProfile(userId).then((p) => {
      setProfile(p);
      setDisplayName(p.display_name);
      setUsername(p.username ?? '');
      setPhone(p.phone ?? '');
    });
  }, [userId]);

  // Saved as soon as it's flipped, like the theme and language below,
  // rather than waiting for the Save button - it's a switch, and a switch
  // that silently doesn't apply until another tap reads as broken. Shown
  // flipped immediately and put back if the save fails.
  const onTogglePrivacy = async (
    key: 'show_read_receipts' | 'show_last_seen',
    value: boolean,
  ) => {
    if (!userId) return;
    setProfile((current) => (current ? { ...current, [key]: value } : current));
    try {
      await profilesData.updateProfile(userId, { [key]: value });
      if (key === 'show_last_seen') setSharesLastSeen(value);
    } catch {
      setProfile((current) => (current ? { ...current, [key]: !value } : current));
      Alert.alert(t('profile.privacySaveFailedTitle'), t('profile.privacySaveFailedMessage'));
    }
  };

  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission | null>(null);

  // Re-read on every mount rather than once: the fix for a blocked
  // permission happens in system settings, outside the app, so the
  // answer can change while this screen is backgrounded.
  useEffect(() => {
    let cancelled = false;
    void getNotificationPermission()
      .then((permission) => {
        if (!cancelled) setNotificationPermission(permission);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const onEnableNotifications = async () => {
    // Idempotent: if the choice has already been made this returns it
    // without prompting, which is what makes the blocked case detectable.
    const permission = await requestPermissionAndRegisterToken().catch(
      () => 'denied' as NotificationPermission,
    );
    setNotificationPermission(permission);
    if (permission === 'granted') return;

    Alert.alert(
      t('profile.notificationsBlockedTitle'),
      t('profile.notificationsBlockedMessage'),
      [
        { text: t('profile.cancel'), style: 'cancel' },
        {
          text: t('profile.notificationsOpenSettings'),
          onPress: () => void openNotificationSettings().catch(() => {}),
        },
      ],
    );
  };

  const onChangePhoto = async () => {
    if (!userId) return;
    const result = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.7,
      includeBase64: true,
    });
    const asset = result.assets?.[0];
    if (!asset?.base64) return;

    setIsUploadingPhoto(true);
    try {
      const path = await profilesData.uploadAvatar(
        userId,
        asset.base64,
        asset.type ?? 'image/jpeg',
      );
      const updated = await profilesData.updateProfile(userId, { avatar_path: path });
      setProfile((current) => (current ? { ...current, ...updated } : current));
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const onDeleteAccount = () => {
    if (isDeletingAccount) return;
    void confirm({
      title: t('profile.deleteAccountConfirmTitle'),
      message: t('profile.deleteAccountConfirmMessage'),
      cancelLabel: t('profile.cancel'),
      options: [
        { id: 'delete', label: t('profile.deleteAccount'), destructive: true },
      ],
    }).then((choice) => {
      // Deletion is irreversible, so it stays gated behind re-entering the
      // password rather than firing straight off this confirmation - a
      // stolen or left-unlocked device shouldn't be enough on its own.
      if (choice === 'delete') setIsPasswordPromptVisible(true);
    });
  };

  const onCancelPasswordPrompt = () => {
    if (isDeletingAccount) return;
    setIsPasswordPromptVisible(false);
    setDeletePassword('');
    setDeletePasswordError(null);
  };

  const onSubmitDeletePassword = async () => {
    if (!profile?.email || isDeletingAccount || !deletePassword) return;
    setDeletePasswordError(null);
    setIsDeletingAccount(true);
    try {
      // Re-authenticating (rather than checking the password some other
      // way) is the step-up check itself - it fails the same way a normal
      // login would if the password's wrong, and refreshes this device's
      // session as a side effect if it's right.
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password: deletePassword,
      });
      if (authError) {
        setDeletePasswordError(t('profile.deleteAccountWrongPassword'));
        setIsDeletingAccount(false);
        return;
      }

      await profilesData.deleteAccount();
      // The account (and its session) is already gone server-side at this
      // point - a local-only signOut just clears the on-device session so
      // RootNavigator's auth listener drops back to the auth stack,
      // without round-tripping to revoke a session that's already invalid.
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    } catch {
      setIsDeletingAccount(false);
      setIsPasswordPromptVisible(false);
      setDeletePassword('');
      Alert.alert(
        t('profile.deleteAccountFailedTitle'),
        t('profile.deleteAccountFailedMessage'),
      );
    }
  };

  const canSave = displayName.trim().length > 0;

  const onSave = async () => {
    if (!userId || !canSave) return;
    setError(null);

    const trimmedUsername = username.trim();
    if (trimmedUsername && !USERNAME_PATTERN.test(trimmedUsername)) {
      setError(t('profile.usernameInvalidError'));
      return;
    }
    const trimmedPhone = profilesData.normalizePhone(phone);
    if (trimmedPhone && !PHONE_PATTERN.test(trimmedPhone)) {
      setError(t('profile.phoneInvalidError'));
      return;
    }

    setIsSaving(true);
    try {
      await profilesData.updateProfile(userId, {
        display_name: displayName.trim(),
        username: trimmedUsername || null,
        phone: trimmedPhone || null,
      });
      navigation.goBack();
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('profiles_username_key')) {
        setError(t('profile.usernameTakenError'));
      } else if (message.includes('profiles_phone_key')) {
        setError(t('profile.phoneTakenError'));
      } else {
        setError(t('profile.saveFailedError'));
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      <View style={[styles.content, { maxWidth: contentWidth }]}>
        <View style={styles.header}>
          <Touchable
            style={styles.cancelButton}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
          >
            <Text style={styles.cancelText}>{t('profile.cancel')}</Text>
          </Touchable>
          <Text style={styles.title}>{t('profile.title')}</Text>
          <Touchable
            style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
            onPress={() => void onSave()}
            disabled={isSaving || !canSave}
            accessibilityRole="button"
            accessibilityState={{ disabled: isSaving || !canSave }}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={[styles.saveText, !canSave && styles.saveTextDisabled]}>
                {t('profile.save')}
              </Text>
            )}
          </Touchable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + spacing.xxl }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.avatarSection}>
          <Touchable
            onPress={() => void onChangePhoto()}
            disabled={isUploadingPhoto}
            accessibilityRole="button"
            accessibilityLabel={t('profile.changePhoto')}
          >
            <Avatar
              name={displayName || profile?.email || '?'}
              avatarPath={profile?.avatar_path}
              size={112}
            />
            <View style={styles.avatarEditBadge}>
              {isUploadingPhoto ? (
                <ActivityIndicator size="small" color={colors.paper} />
              ) : (
                <Icon name="camera" size={16} color={colors.paper} />
              )}
            </View>
          </Touchable>
          <View style={styles.identity}>
            <Text style={styles.identityName} numberOfLines={1}>
              {displayName.trim() || profile?.display_name || ''}
            </Text>
            {!!username.trim() && (
              <Text style={styles.identityHandle} numberOfLines={1}>
                @{username.trim()}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.account')}</Text>
          <View style={styles.card}>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{t('profile.displayNameLabel')}</Text>
              <TextInput
                style={styles.fieldInput}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder={t('profile.displayNamePlaceholder')}
                placeholderTextColor={colors.smoke}
                accessibilityLabel={t('profile.displayNameLabel')}
              />
            </View>
            <View style={styles.cardDivider} />
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{t('profile.usernameLabel')}</Text>
              <View style={styles.handleRow}>
                <Text style={styles.handleAt}>@</Text>
                <TextInput
                  style={[styles.fieldInput, styles.handleInput]}
                  value={username}
                  onChangeText={setUsername}
                  placeholder={t('profile.usernamePlaceholder')}
                  placeholderTextColor={colors.smoke}
                  autoCapitalize="none"
                  accessibilityLabel={t('profile.usernameLabel')}
                />
              </View>
            </View>
            <View style={styles.cardDivider} />
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{t('profile.phoneLabel')}</Text>
              <TextInput
                style={styles.fieldInput}
                value={phone}
                onChangeText={setPhone}
                placeholder={t('profile.phonePlaceholder')}
                placeholderTextColor={colors.smoke}
                keyboardType="phone-pad"
                accessibilityLabel={t('profile.phoneLabel')}
              />
            </View>
          </View>
          {error && <Text style={styles.error}>{error}</Text>}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.notificationsAndPrivacy')}</Text>
          <View style={styles.card}>
            {/* Notifications are the system's permission, not a setting
                of ours - so this row reports it, and offers the way to
                turn it on when it's off. */}
            <View style={styles.settingRow}>
              <View style={styles.settingIcon}>
                <Icon name="bell" size={18} color={colors.char} />
              </View>
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>{t('profile.notifications')}</Text>
                <Text style={styles.settingHint}>
                  {notificationPermission === 'granted'
                    ? t('profile.notificationsOn')
                    : t('profile.notificationsOff')}
                </Text>
              </View>
              {notificationPermission === 'denied' && (
                <Touchable
                  style={styles.enableButton}
                  onPress={() => void onEnableNotifications()}
                  accessibilityRole="button"
                >
                  <Text style={styles.enableButtonText}>{t('profile.notificationsEnable')}</Text>
                </Touchable>
              )}
            </View>
            {(
              [
                ['show_read_receipts', 'check-double', 'profile.readReceipts', 'profile.readReceiptsHint'],
                ['show_last_seen', 'eye', 'profile.lastSeen', 'profile.lastSeenHint'],
              ] as const
            ).map(([key, icon, labelKey, hintKey]) => (
              <View key={key} style={[styles.settingRow, styles.settingRowDivided]}>
                <View style={styles.settingIcon}>
                  <Icon name={icon} size={18} color={colors.char} />
                </View>
                <View style={styles.settingText}>
                  <Text style={styles.settingTitle}>{t(labelKey)}</Text>
                  <Text style={styles.settingHint}>{t(hintKey)}</Text>
                </View>
                <Switch
                  value={profile?.[key] ?? true}
                  onValueChange={(value) => void onTogglePrivacy(key, value)}
                  disabled={!profile}
                  trackColor={{ false: colors.line, true: colors.ember }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor={colors.line}
                  accessibilityLabel={t(labelKey)}
                />
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.appearance')}</Text>
          {/* Each theme as a small picture of itself. */}
          <View style={styles.themeRow} accessibilityRole="radiogroup">
            {THEME_PREFERENCES.map((preference) => {
              const isSelected = preference === themePreference;
              const preview = THEME_PREVIEWS[preference];
              return (
                <Touchable
                  key={preference}
                  style={[styles.themeCard, isSelected && styles.themeCardSelected]}
                  onPress={() => setThemePreference(preference)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected }}
                >
                  <View style={[styles.themePreview, { backgroundColor: preview.bg }]}>
                    <View style={[styles.themeLine, { backgroundColor: preview.line }]} />
                    <View style={[styles.themeLine, styles.themeLineMine]} />
                  </View>
                  <Text style={styles.themeLabel}>{t(THEME_PREFERENCE_LABEL_KEYS[preference])}</Text>
                </Touchable>
              );
            })}
          </View>

          <View style={[styles.card, styles.cardSpaced]}>
            <View style={styles.settingRow}>
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>{t('profile.bubbleColorLabel')}</Text>
                <View style={styles.bubbleSwatchRow}>
                  {BUBBLE_GRADIENT_PRESETS.map((preset) => {
                    const isSelected = preset.id === bubbleGradientId;
                    return (
                      <Touchable
                        key={preset.id}
                        onPress={() => setBubbleGradientId(preset.id)}
                        style={[styles.bubbleSwatchWrap, isSelected && styles.bubbleSwatchWrapSelected]}
                        accessibilityRole="radio"
                        accessibilityLabel={t(`profile.bubbleColorNames.${preset.id}`)}
                        accessibilityState={{ checked: isSelected }}
                      >
                        <LinearGradient
                          colors={[...preset[scheme].mine]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.bubbleSwatch}
                        >
                          {isSelected && <Icon name="check" size={14} color="#FFFFFF" />}
                        </LinearGradient>
                      </Touchable>
                    );
                  })}
                </View>
              </View>
            </View>
            <View style={[styles.settingRow, styles.settingRowDivided]}>
              <View style={styles.settingIcon}>
                <Icon name="images" size={18} color={colors.char} />
              </View>
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>{t('profile.chatWallpaper')}</Text>
                <Text style={styles.settingHint}>{t('profile.chatWallpaperHint')}</Text>
              </View>
              <Switch
                value={chatWallpaper}
                onValueChange={setChatWallpaper}
                trackColor={{ false: colors.line, true: colors.ember }}
                thumbColor="#FFFFFF"
                ios_backgroundColor={colors.line}
                accessibilityLabel={t('profile.chatWallpaper')}
              />
            </View>
            <View style={[styles.settingRow, styles.settingRowDivided]}>
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>{t('profile.language')}</Text>
              </View>
              <View style={styles.choiceRow}>
                {SUPPORTED_LANGUAGES.map((lang: SupportedLanguage) => {
                  const isSelected = i18n.language === lang;
                  return (
                    <Touchable
                      key={lang}
                      style={[styles.choiceChip, isSelected && styles.choiceChipActive]}
                      onPress={() => void setLanguage(lang)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: isSelected }}
                    >
                      <Text style={[styles.choiceText, isSelected && styles.choiceTextActive]}>
                        {lang.toUpperCase()}
                      </Text>
                    </Touchable>
                  );
                })}
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.card}>
            <Touchable
              style={styles.settingRow}
              onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
              accessibilityRole="link"
            >
              <View style={styles.settingIcon}>
                <Icon name="shield-halved" size={18} color={colors.char} />
              </View>
              <Text style={[styles.settingTitle, styles.settingText]}>{t('profile.privacyPolicy')}</Text>
              <Icon name="arrow-up-right-from-square" size={16} color={colors.smoke} />
            </Touchable>
          </View>
        </View>

        {/* Moved here from the bottom bar, where it sat one tap from the
            tab people use most. Still confirmed - it drops you back to
            sign-in. */}
        <Touchable
          style={styles.logoutButton}
          onPress={() =>
            void confirm({
              title: t('footer.logoutConfirmTitle'),
              message: t('footer.logoutConfirmMessage'),
              cancelLabel: t('footer.cancel'),
              options: [{ id: 'logout', label: t('footer.logoutConfirm'), destructive: true }],
            }).then((choice) => {
              if (choice === 'logout') void logout();
            })
          }
          accessibilityRole="button"
        >
          <Icon name="right-from-bracket" size={18} color={colors.danger} />
          <Text style={styles.logoutText}>{t('footer.logoutConfirm')}</Text>
        </Touchable>

        <View style={styles.dangerZone}>
          <Text style={styles.dangerZoneTitle}>{t('profile.dangerZoneTitle')}</Text>

          <Touchable
            style={styles.dangerRow}
            onPress={onDeleteAccount}
            disabled={isDeletingAccount}
          >
            {isDeletingAccount ? (
              <ActivityIndicator size="small" color={colors.danger} />
            ) : (
              <Icon
                name="trash"
                size={15}
                color={colors.danger}
                style={styles.dangerRowIcon}
              />
            )}
            <View style={styles.dangerRowText}>
              <Text style={[styles.dangerRowTitle, styles.dangerRowTitleDestructive]}>
                {t('profile.deleteAccount')}
              </Text>
              <Text style={styles.dangerRowHint}>{t('profile.deleteAccountHint')}</Text>
            </View>
          </Touchable>
        </View>
        <Text style={styles.footerNote}>Hearth · {t('welcome.copyright')}</Text>
        </ScrollView>
      </View>

      <Modal
        visible={isPasswordPromptVisible}
        transparent
        animationType="fade"
        onRequestClose={onCancelPasswordPrompt}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('profile.deleteAccountPasswordTitle')}</Text>
            <Text style={styles.modalMessage}>{t('profile.deleteAccountPasswordMessage')}</Text>
            <PasswordField
              label={t('auth.login.passwordLabel')}
              value={deletePassword}
              onChangeText={(text) => {
                setDeletePassword(text);
                setDeletePasswordError(null);
              }}
            />
            {deletePasswordError && <Text style={styles.error}>{deletePasswordError}</Text>}
            <View style={styles.modalActions}>
              <Touchable
                style={styles.modalCancelButton}
                onPress={onCancelPasswordPrompt}
                disabled={isDeletingAccount}
              >
                <Text style={styles.modalCancelText}>{t('profile.cancel')}</Text>
              </Touchable>
              <Touchable
                style={[
                  styles.modalDeleteButton,
                  !deletePassword && styles.modalDeleteButtonDisabled,
                ]}
                onPress={() => void onSubmitDeletePassword()}
                disabled={isDeletingAccount || !deletePassword}
              >
                {isDeletingAccount ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.modalDeleteText}>{t('profile.deleteAccount')}</Text>
                )}
              </Touchable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  content: { flex: 1, width: '100%', alignSelf: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.lg + 4, gap: spacing.xl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: spacing.lg + 4,
    paddingBottom: spacing.md,
  },
  cancelButton: { minHeight: 44, paddingHorizontal: 4, justifyContent: 'center' },
  cancelText: { fontFamily: fonts.family, color: colors.smoke, fontSize: 16, fontWeight: '500' },
  title: { fontFamily: fonts.family, fontSize: fontSizes.bodyLg, fontWeight: '700', color: colors.ink },
  saveButton: {
    minWidth: 76,
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: colors.ember,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { fontFamily: fonts.family, color: '#FFFFFF', fontSize: fontSizes.body, fontWeight: '600' },
  saveTextDisabled: { color: colors.smoke },
  saveButtonDisabled: { backgroundColor: colors.fill },
  avatarSection: { alignItems: 'center', gap: spacing.md, paddingTop: 4 },
  avatarEditBadge: {
    position: 'absolute',
    right: 0,
    bottom: 2,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.ink,
    borderWidth: 3,
    borderColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: { alignItems: 'center', gap: 2 },
  identityName: { fontFamily: fonts.family, fontSize: fontSizes.title, fontWeight: '700', letterSpacing: -0.4, color: colors.ink },
  identityHandle: { fontFamily: fonts.family, fontSize: 14, color: colors.smoke },
  section: { gap: spacing.sm },
  sectionTitle: {
    fontFamily: fonts.family,
    fontSize: fontSizes.footnote,
    fontWeight: '600',
    letterSpacing: 0.26,
    color: colors.smoke,
    marginHorizontal: 4,
  },
  card: { backgroundColor: colors.paper2, borderRadius: 20, overflow: 'hidden' },
  cardSpaced: { marginTop: spacing.sm },
  cardDivider: { height: 1, backgroundColor: colors.fill, marginLeft: spacing.lg },
  fieldRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: 2 },
  fieldLabel: { fontFamily: fonts.family, fontSize: fontSizes.caption, fontWeight: '500', color: colors.smoke },
  fieldInput: { fontFamily: fonts.family, fontSize: 16, color: colors.ink, padding: 0, minHeight: 24 },
  handleRow: { flexDirection: 'row', alignItems: 'center' },
  handleAt: { fontFamily: fonts.family, fontSize: 16, color: colors.smoke },
  handleInput: { flex: 1 },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  settingRowDivided: { borderTopWidth: 1, borderTopColor: colors.fill },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingText: { flex: 1, minWidth: 0, gap: 2 },
  settingTitle: { fontFamily: fonts.family, fontSize: 16, fontWeight: '500', color: colors.ink },
  settingHint: { fontFamily: fonts.family, fontSize: fontSizes.footnote, lineHeight: 18, color: colors.smoke },
  enableButton: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.emberTint,
    justifyContent: 'center',
  },
  enableButtonText: { fontFamily: fonts.family, fontSize: 14, fontWeight: '600', color: colors.emberText },
  themeRow: { flexDirection: 'row', gap: spacing.sm },
  themeCard: {
    flex: 1,
    gap: spacing.sm,
    padding: 10,
    borderRadius: 18,
    backgroundColor: colors.paper2,
    borderWidth: 2,
    borderColor: colors.line,
  },
  themeCardSelected: { borderColor: colors.ember },
  themePreview: { height: 56, borderRadius: 10, justifyContent: 'center', gap: 5, paddingHorizontal: 9 },
  themeLine: { height: 7, width: '60%', borderRadius: 4 },
  themeLineMine: { width: '40%', alignSelf: 'flex-end', backgroundColor: '#6D35E8' },
  themeLabel: { fontFamily: fonts.family, fontSize: 14, fontWeight: '600', color: colors.ink, paddingLeft: 2 },
  choiceRow: { flexDirection: 'row', gap: spacing.sm },
  choiceChip: {
    minHeight: 36,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper2,
  },
  choiceChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  choiceText: { fontFamily: fonts.family, fontSize: 14, fontWeight: '600', color: colors.char },
  choiceTextActive: { color: colors.paper },
  bubbleSwatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  bubbleSwatchWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    padding: 2,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  bubbleSwatchWrapSelected: { borderColor: colors.ink },
  bubbleSwatch: {
    flex: 1,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutButton: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.dangerTint,
    backgroundColor: colors.dangerTint,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  logoutText: { fontFamily: fonts.family, fontSize: 16, fontWeight: '600', color: colors.danger },
  footerNote: { fontFamily: fonts.family, textAlign: 'center', fontSize: fontSizes.caption, color: colors.smoke },
  label: {
    fontFamily: fonts.family,
    fontSize: fontSizes.caption,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.smoke,
    marginBottom: 7,
  },
  input: {
    fontFamily: fonts.family,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper2,
    borderRadius: radii.md,
    padding: 13,
    fontSize: fontSizes.body,
    color: colors.ink,
  },
  error: { fontFamily: fonts.family, color: colors.danger, paddingHorizontal: 4, fontSize: fontSizes.footnote },
  dangerZone: {},
  dangerZoneTitle: {
    fontFamily: fonts.family,
    fontSize: fontSizes.caption,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.smoke,
    marginBottom: spacing.sm,
  },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.paper2,
    borderRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  dangerRowIcon: { width: 22, textAlign: 'center' },
  dangerRowText: { flex: 1, marginLeft: spacing.sm },
  dangerRowTitle: { fontFamily: fonts.family, fontSize: fontSizes.body, fontWeight: '600', color: colors.ink },
  dangerRowTitleDestructive: { color: colors.danger },
  dangerRowHint: { fontFamily: fonts.family, fontSize: fontSizes.caption, color: colors.smoke, marginTop: 2 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.lg,
    ...elevation.lg,
  },
  modalTitle: { fontFamily: fonts.family, fontSize: fontSizes.bodyLg, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  modalMessage: { fontFamily: fonts.family, fontSize: fontSizes.footnote, color: colors.smoke, marginBottom: spacing.lg, lineHeight: 19 },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  modalCancelButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radii.md,
  },
  modalCancelText: { fontFamily: fonts.family, color: colors.smoke, fontSize: fontSizes.body, fontWeight: '700' },
  modalDeleteButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: colors.dangerFill,
    minWidth: 96,
    alignItems: 'center',
  },
  modalDeleteButtonDisabled: { opacity: 0.5 },
  modalDeleteText: { fontFamily: fonts.family, color: colors.white, fontSize: fontSizes.body, fontWeight: '700' },
});