import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { FontAwesome6 } from '@react-native-vector-icons/fontawesome6/static';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../auth/AuthContext';
import { AppWallpaper } from '../components/AppWallpaper';
import { PasswordField } from '../components/PasswordField';
import { useToast } from '../components/Toast';
import { useContentWidth } from '../hooks/useContentWidth';
import { colors, spacing } from '../theme/tokens';
import { authStyles as s } from './authStyles';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export function RegisterScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { register } = useAuth();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const { contentWidth } = useContentWidth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (password.length < 8) {
      setError(t('auth.register.passwordTooShortError'));
      return;
    }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError(t('auth.register.passwordWeakError'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('auth.register.passwordMismatchError'));
      return;
    }
    setIsSubmitting(true);
    try {
      const { needsEmailConfirmation } = await register(
        email,
        password,
        displayName,
      );
      // Registering doesn't sign the user in here (email confirmation is
      // required first) - show the toast and send them to Login, same
      // as a successful login itself does further down the line.
      showToast(
        needsEmailConfirmation
          ? t('auth.register.confirmEmailInfo')
          : t('auth.register.successToast'),
      );
      navigation.navigate('Login');
    } catch {
      setError(t('auth.register.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <AppWallpaper />
      <ScrollView
        contentContainerStyle={[
          s.container,
          {
            paddingTop: insets.top + spacing.xxl,
            paddingBottom: insets.bottom + spacing.xxl,
            width: '100%',
            maxWidth: contentWidth,
            alignSelf: 'center',
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
      <Text style={s.title}>{t('auth.register.title')}</Text>
      <Text style={s.subtitle}>{t('auth.register.subtitle')}</Text>

      <View style={s.field}>
        <Text style={s.label}>{t('auth.register.nameLabel')}</Text>
        <TextInput style={s.input} value={displayName} onChangeText={setDisplayName} />
      </View>
      <View style={s.field}>
        <Text style={s.label}>{t('auth.register.emailLabel')}</Text>
        <TextInput
          style={s.input}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
      </View>
      <PasswordField
        label={t('auth.register.passwordLabel')}
        value={password}
        onChangeText={setPassword}
      />
      <Text style={s.hint}>{t('auth.register.passwordHint')}</Text>
      <PasswordField
        label={t('auth.register.confirmPasswordLabel')}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
      />

      {error && <Text style={s.error}>{error}</Text>}

      <TouchableOpacity
        style={[s.primaryButton, isSubmitting && s.primaryButtonDisabled]}
        onPress={() => void onSubmit()}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator color={colors.white} size="small" />
        ) : (
          <FontAwesome6 name="user-plus" iconStyle="solid" size={16} color={colors.white} />
        )}
        <Text style={s.primaryButtonText}>{t('auth.register.submit')}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.footer} onPress={() => navigation.navigate('Login')}>
        <Text style={s.footerText}>{t('auth.register.switchToLogin')}</Text>
      </TouchableOpacity>
      </ScrollView>
    </View>
  );
}