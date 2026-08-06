import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import LinearGradient from 'react-native-linear-gradient';
import { FontAwesome6 } from '@react-native-vector-icons/fontawesome6/static';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import * as profilesData from '../data/profiles';
import { exportAccountData } from '../data/export';
import { Avatar } from '../components/Avatar';
import { AppWallpaper } from '../components/AppWallpaper';
import { useToast } from '../components/Toast';
import { useContentWidth } from '../hooks/useContentWidth';
import { BUBBLE_GRADIENT_PRESETS, radii, spacing, ThemeColors } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';
import { Profile } from '../types';

type Props = NativeStackScreenProps<AppStackParamList, 'Profile'>;

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;
// Hosted from docs/privacy-policy.html - requires GitHub Pages enabled on
// this repo (Settings > Pages > Deploy from a branch > main > /docs).
const PRIVACY_POLICY_URL = 'https://ivaylo91.github.io/Message-App/privacy-policy.html';
const PHONE_PATTERN = /^\+?[0-9]{7,15}$/;

export function ProfileScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { userId } = useAuth();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const { contentWidth } = useContentWidth();
  const { colors, scheme, bubbleGradientId, setBubbleGradientId } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  useEffect(() => {
    if (!userId) return;
    void profilesData.fetchProfile(userId).then((p) => {
      setProfile(p);
      setDisplayName(p.display_name);
      setUsername(p.username ?? '');
      setPhone(p.phone ?? '');
    });
  }, [userId]);

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

  const onExportData = async () => {
    if (!userId || isExporting) return;
    setIsExporting(true);
    try {
      await exportAccountData(userId);
      showToast(t('profile.exportSuccessToast'));
    } catch {
      Alert.alert(t('profile.exportFailedTitle'), t('profile.exportFailedMessage'));
    } finally {
      setIsExporting(false);
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
          onPress: () => void confirmDeleteAccount(),
        },
      ],
    );
  };

  const confirmDeleteAccount = async () => {
    setIsDeletingAccount(true);
    try {
      await profilesData.deleteAccount();
      // The account (and its session) is already gone server-side at this
      // point - a local-only signOut just clears the on-device session so
      // RootNavigator's auth listener drops back to the auth stack,
      // without round-tripping to revoke a session that's already invalid.
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    } catch {
      setIsDeletingAccount(false);
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
      <AppWallpaper />
      <View style={[styles.content, { maxWidth: contentWidth }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
            <FontAwesome6 name="xmark" iconStyle="solid" size={13} color={colors.danger} />
            <Text style={styles.cancelText}>{t('profile.cancel')}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('profile.title')}</Text>
          <TouchableOpacity
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
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={() => void onChangePhoto()} disabled={isUploadingPhoto}>
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
          </TouchableOpacity>
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
          <Text style={styles.label}>{t('profile.bubbleColorLabel')}</Text>
          <View style={styles.bubbleSwatchRow}>
            {BUBBLE_GRADIENT_PRESETS.map((preset) => {
              const isSelected = preset.id === bubbleGradientId;
              return (
                <TouchableOpacity
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
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.legalSection}>
          <TouchableOpacity style={styles.legalRow} onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}>
            <FontAwesome6
              name="shield-halved"
              iconStyle="solid"
              size={13}
              color={colors.smoke}
              style={styles.dangerRowIcon}
            />
            <Text style={styles.legalRowText}>{t('profile.privacyPolicy')}</Text>
            <FontAwesome6 name="arrow-up-right-from-square" iconStyle="solid" size={11} color={colors.smoke} />
          </TouchableOpacity>
        </View>

        <View style={styles.dangerZone}>
          <Text style={styles.dangerZoneTitle}>{t('profile.dangerZoneTitle')}</Text>

          <TouchableOpacity
            style={styles.dangerRow}
            onPress={() => void onExportData()}
            disabled={isExporting}
          >
            {isExporting ? (
              <ActivityIndicator size="small" color={colors.ink} />
            ) : (
              <FontAwesome6
                name="file-export"
                iconStyle="solid"
                size={15}
                color={colors.ink}
                style={styles.dangerRowIcon}
              />
            )}
            <View style={styles.dangerRowText}>
              <Text style={styles.dangerRowTitle}>{t('profile.exportData')}</Text>
              <Text style={styles.dangerRowHint}>{t('profile.exportDataHint')}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
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
          </TouchableOpacity>
        </View>
        </ScrollView>
      </View>
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
  cancelText: { color: colors.danger, fontSize: 15, fontWeight: '800' },
  title: { fontSize: 17, fontWeight: '700', color: colors.ink },
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
  saveText: { color: colors.sage, fontSize: 15, fontWeight: '800' },
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
  changePhotoHint: { fontSize: 12.5, color: colors.smoke, marginTop: spacing.sm },
  field: { paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
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
    fontSize: 12,
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
    fontSize: 15,
    color: colors.ink,
  },
  error: { color: colors.danger, paddingHorizontal: spacing.lg, fontSize: 13 },
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
  legalRowText: { flex: 1, fontSize: 14, color: colors.smoke, fontWeight: '600' },
  dangerZone: {
    marginTop: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  dangerZoneTitle: {
    fontSize: 12,
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
  dangerRowTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  dangerRowTitleDestructive: { color: colors.danger },
  dangerRowHint: { fontSize: 12.5, color: colors.smoke, marginTop: 2 },
});