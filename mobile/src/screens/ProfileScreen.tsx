import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../auth/AuthContext';
import * as profilesData from '../data/profiles';
import { Avatar } from '../components/Avatar';
import { useContentWidth } from '../hooks/useContentWidth';
import { colors, radii, spacing } from '../theme/tokens';
import { Profile } from '../types';

type Props = NativeStackScreenProps<AppStackParamList, 'Profile'>;

export function ProfileScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { userId } = useAuth();
  const insets = useSafeAreaInsets();
  const { contentWidth } = useContentWidth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  useEffect(() => {
    if (!userId) return;
    void profilesData.fetchProfile(userId).then((p) => {
      setProfile(p);
      setDisplayName(p.display_name);
    });
  }, [userId]);

  const onChangePhoto = async () => {
    if (!userId) return;
    const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.7 });
    const asset = result.assets?.[0];
    if (!asset?.uri) return;

    setIsUploadingPhoto(true);
    try {
      const path = await profilesData.uploadAvatar(
        userId,
        asset.uri,
        asset.type ?? 'image/jpeg',
      );
      const updated = await profilesData.updateProfile(userId, { avatar_path: path });
      setProfile(updated);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const canSave = displayName.trim().length > 0;

  const onSave = async () => {
    if (!userId || !canSave) return;
    setIsSaving(true);
    try {
      await profilesData.updateProfile(userId, { display_name: displayName.trim() });
      navigation.goBack();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.lg }]}>
      <View style={[styles.content, { maxWidth: contentWidth }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
            <Text style={styles.cancelText}>{t('profile.cancel')}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('profile.title')}</Text>
          <TouchableOpacity
            style={styles.saveButton}
            onPress={() => void onSave()}
            disabled={isSaving || !canSave}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.ember} />
            ) : (
              <Text style={[styles.saveText, !canSave && styles.saveTextDisabled]}>
                {t('profile.save')}
              </Text>
            )}
          </TouchableOpacity>
        </View>

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
                <Text style={styles.avatarEditBadgeText}>📷</Text>
              )}
            </View>
          </TouchableOpacity>
          <Text style={styles.changePhotoHint}>{t('profile.changePhoto')}</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('profile.usernameLabel')}</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder={t('profile.usernamePlaceholder')}
            placeholderTextColor={colors.smoke}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { width: '100%', alignSelf: 'center' },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  cancelButton: { position: 'absolute', left: spacing.lg, top: 0 },
  cancelText: { color: colors.ember, fontSize: 15, fontWeight: '600' },
  title: { fontSize: 17, fontWeight: '700', color: colors.ink },
  saveButton: { position: 'absolute', right: spacing.lg, top: 0 },
  saveText: { color: colors.ember, fontSize: 15, fontWeight: '700' },
  saveTextDisabled: { color: colors.smoke },
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
  avatarEditBadgeText: { fontSize: 13 },
  changePhotoHint: { fontSize: 12.5, color: colors.smoke, marginTop: spacing.sm },
  field: { paddingHorizontal: spacing.lg },
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
});