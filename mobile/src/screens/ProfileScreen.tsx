import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import LinearGradient from 'react-native-linear-gradient';
import { FontAwesome6 } from '@react-native-vector-icons/fontawesome6/static';
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
import { useContentWidth } from '../hooks/useContentWidth';
import {
  BUBBLE_GRADIENT_PRESETS,
  elevation,
  fontSizes,
  radii,
  spacing,
  ThemeColors,
  ThemePreference,
} from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';
import { Profile } from '../types';

type Props = NativeStackScreenProps<AppStackParamList, 'Profile'>;

const THEME_PREFERENCES: ThemePreference[] = ['system', 'light', 'dark'];
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
  const { userId } = useAuth();
  const insets = useSafeAreaInsets();
  const { contentWidth } = useContentWidth();
  const {
    colors,
    scheme,
    bubbleGradientId,
    setBubbleGradientId,
    themePreference,
    setThemePreference,
  } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [profile, setProfile] = useState<Profile | null>(null);
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
    void profilesData.fetchProfile(userId).then((p) => {
      setProfile(p);
      setDisplayName(p.display_name);
      setUsername(p.username ?? '');
      setPhone(p.phone ?? '');
    });
  }, [userId]);

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
      setProfile(updated);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const onDeleteAccount = () => {
    if (isDeletingAccount) return;
    Alert.alert(
      t('profile.deleteAccountConfirmTitle'),
      t('profile.deleteAccountConfirmMessage'),
      [
        { text: t('profile.cancel'), style: 'cancel' },
        {
          text: t('profile.deleteAccount'),
          style: 'destructive',
          // Deletion is irreversible, so it's gated behind re-entering the
          // password rather than firing straight off this confirm tap - a
          // stolen/left-unlocked device shouldn't be enough on its own.
          onPress: () => setIsPasswordPromptVisible(true),
        },
      ],
    );
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
    <View style={[styles.container, { paddingTop: insets.top + spacing.lg }]}>
      <View style={[styles.content, { maxWidth: contentWidth }]}>
        <View style={styles.header}>
          <Touchable style={styles.cancelButton} onPress={() => navigation.goBack()}>
            <FontAwesome6 name="xmark" iconStyle="solid" size={13} color={colors.danger} />
            <Text style={styles.cancelText}>{t('profile.cancel')}</Text>
          </Touchable>
          <Text style={styles.title}>{t('profile.title')}</Text>
          <Touchable
            style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
            onPress={() => void onSave()}
            disabled={isSaving || !canSave}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.sage} />
            ) : (
              <>
                <FontAwesome6
                  name="check"
                  iconStyle="solid"
                  size={13}
                  color={canSave ? colors.sage : colors.smoke}
                />
                <Text style={[styles.saveText, !canSave && styles.saveTextDisabled]}>
                  {t('profile.save')}
                </Text>
              </>
            )}
          </Touchable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.avatarSection}>
          <Touchable onPress={() => void onChangePhoto()} disabled={isUploadingPhoto}>
            <Avatar
              name={displayName || profile?.email || '?'}
              avatarPath={profile?.avatar_path}
              size={96}
            />
            <View style={styles.avatarEditBadge}>
              {isUploadingPhoto ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <FontAwesome6 name="camera" iconStyle="solid" size={13} color={colors.white} />
              )}
            </View>
          </Touchable>
          <Text style={styles.changePhotoHint}>{t('profile.changePhoto')}</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('profile.displayNameLabel')}</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder={t('profile.displayNamePlaceholder')}
            placeholderTextColor={colors.smoke}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('profile.usernameLabel')}</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder={t('profile.usernamePlaceholder')}
            placeholderTextColor={colors.smoke}
            autoCapitalize="none"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('profile.phoneLabel')}</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder={t('profile.phonePlaceholder')}
            placeholderTextColor={colors.smoke}
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('profile.notifications')}</Text>
          <View style={styles.notificationRow}>
            <Text style={styles.notificationStatus}>
              {notificationPermission === 'granted'
                ? t('profile.notificationsOn')
                : t('profile.notificationsOff')}
            </Text>
            {notificationPermission === 'denied' && (
              <Touchable
                style={styles.choiceChipActive}
                onPress={() => void onEnableNotifications()}
                accessibilityRole="button"
              >
                <Text style={styles.choiceTextActive}>{t('profile.notificationsEnable')}</Text>
              </Touchable>
            )}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('profile.appearance')}</Text>
          <View style={styles.choiceRow}>
            {THEME_PREFERENCES.map((preference) => {
              const isSelected = preference === themePreference;
              return (
                <Touchable
                  key={preference}
                  style={[styles.choiceChip, isSelected && styles.choiceChipActive]}
                  onPress={() => setThemePreference(preference)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text style={[styles.choiceText, isSelected && styles.choiceTextActive]}>
                    {t(THEME_PREFERENCE_LABEL_KEYS[preference])}
                  </Text>
                </Touchable>
              );
            })}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('profile.language')}</Text>
          <View style={styles.choiceRow}>
            {SUPPORTED_LANGUAGES.map((lang: SupportedLanguage) => {
              const isSelected = i18n.language === lang;
              return (
                <Touchable
                  key={lang}
                  style={[styles.choiceChip, isSelected && styles.choiceChipActive]}
                  onPress={() => void setLanguage(lang)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text style={[styles.choiceText, isSelected && styles.choiceTextActive]}>
                    {lang.toUpperCase()}
                  </Text>
                </Touchable>
              );
            })}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('profile.bubbleColorLabel')}</Text>
          <View style={styles.bubbleSwatchRow}>
            {BUBBLE_GRADIENT_PRESETS.map((preset) => {
              const isSelected = preset.id === bubbleGradientId;
              return (
                <Touchable
                  key={preset.id}
                  onPress={() => setBubbleGradientId(preset.id)}
                  style={[styles.bubbleSwatchWrap, isSelected && styles.bubbleSwatchWrapSelected]}
                  accessibilityRole="button"
                  accessibilityLabel={t(`profile.bubbleColorNames.${preset.id}`)}
                  accessibilityState={{ selected: isSelected }}
                >
                  <LinearGradient
                    colors={[...preset[scheme].mine]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.bubbleSwatch}
                  >
                    {isSelected && (
                      <FontAwesome6 name="check" iconStyle="solid" size={14} color={colors.white} />
                    )}
                  </LinearGradient>
                </Touchable>
              );
            })}
          </View>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.legalSection}>
          <Touchable style={styles.legalRow} onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}>
            <FontAwesome6
              name="shield-halved"
              iconStyle="solid"
              size={13}
              color={colors.smoke}
              style={styles.dangerRowIcon}
            />
            <Text style={styles.legalRowText}>{t('profile.privacyPolicy')}</Text>
            <FontAwesome6 name="arrow-up-right-from-square" iconStyle="solid" size={11} color={colors.smoke} />
          </Touchable>
        </View>

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
              <FontAwesome6
                name="trash"
                iconStyle="solid"
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
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  cancelButton: {
    position: 'absolute',
    left: spacing.lg,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: `${colors.danger}1F`,
  },
  cancelText: { color: colors.danger, fontSize: fontSizes.body, fontWeight: '800' },
  title: { fontSize: fontSizes.bodyLg, fontWeight: '700', color: colors.ink },
  saveButton: {
    position: 'absolute',
    right: spacing.lg,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: `${colors.sage}1F`,
  },
  saveText: { color: colors.sage, fontSize: fontSizes.body, fontWeight: '800' },
  saveTextDisabled: { color: colors.smoke },
  saveButtonDisabled: { backgroundColor: `${colors.smoke}1F` },
  avatarSection: {
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.xxl,
  },
  avatarEditBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.ember,
    borderWidth: 2,
    borderColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changePhotoHint: { fontSize: fontSizes.caption, color: colors.smoke, marginTop: spacing.sm },
  field: { paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  choiceRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 6 },
  choiceChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper2,
  },
  choiceChipActive: { backgroundColor: colors.ember, borderColor: colors.ember },
  choiceText: { fontSize: fontSizes.footnote, fontWeight: '700', color: colors.smoke },
  choiceTextActive: { color: colors.white },
  bubbleSwatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  bubbleSwatchWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    padding: 2,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  bubbleSwatchWrapSelected: { borderColor: colors.ink },
  bubbleSwatch: {
    flex: 1,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: fontSizes.caption,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.smoke,
    marginBottom: 7,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper2,
    borderRadius: radii.md,
    padding: 13,
    fontSize: fontSizes.body,
    color: colors.ink,
  },
  error: { color: colors.danger, paddingHorizontal: spacing.lg, fontSize: fontSizes.footnote },
  legalSection: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
  },
  legalRowText: { flex: 1, fontSize: fontSizes.body, color: colors.smoke, fontWeight: '600' },
  dangerZone: {
    marginTop: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  dangerZoneTitle: {
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
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper2,
    borderRadius: radii.md,
    padding: 13,
    marginBottom: spacing.sm,
  },
  dangerRowIcon: { width: 22, textAlign: 'center' },
  dangerRowText: { flex: 1, marginLeft: spacing.sm },
  dangerRowTitle: { fontSize: fontSizes.body, fontWeight: '600', color: colors.ink },
  dangerRowTitleDestructive: { color: colors.danger },
  dangerRowHint: { fontSize: fontSizes.caption, color: colors.smoke, marginTop: 2 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  notificationRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  notificationStatus: { flex: 1, fontSize: fontSizes.body, color: colors.ink },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.lg,
    ...elevation.lg,
  },
  modalTitle: { fontSize: fontSizes.bodyLg, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  modalMessage: { fontSize: fontSizes.footnote, color: colors.smoke, marginBottom: spacing.lg, lineHeight: 19 },
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
  modalCancelText: { color: colors.smoke, fontSize: fontSizes.body, fontWeight: '700' },
  modalDeleteButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: colors.danger,
    minWidth: 96,
    alignItems: 'center',
  },
  modalDeleteButtonDisabled: { opacity: 0.5 },
  modalDeleteText: { color: colors.white, fontSize: fontSizes.body, fontWeight: '700' },
});