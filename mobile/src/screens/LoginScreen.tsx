import React, { useMemo, useState } from 'react';
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
import { spacing } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';
import { makeAuthStyles } from './authStyles';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { login } = useAuth();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const { contentWidth } = useContentWidth();
  const { colors } = useTheme();
  const s = useMemo(() => makeAuthStyles(colors), [colors]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      // The auth-state change this triggers swaps LoginScreen out for the
      // app's main stack almost immediately - showToast still lands fine
      // since it targets ToastProvider's own state, not this screen's.
      showToast(t('auth.login.successToast'));
    } catch {
      setError(t('auth.login.error'));
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
      <Text style={s.title}>{t('auth.login.title')}</Text>
      <Text style={s.subtitle}>{t('auth.login.subtitle')}</Text>

      <View style={s.field}>
        <Text style={s.label}>{t('auth.login.emailLabel')}</Text>
        <TextInput
          style={s.input}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
      </View>
      <PasswordField
        label={t('auth.login.passwordLabel')}
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity
        style={s.forgotPasswordLink}
        onPress={() => navigation.navigate('ForgotPassword')}
      >
        <Text style={s.forgotPasswordText}>{t('auth.login.forgotPassword')}</Text>
      </TouchableOpacity>

      {error && <Text style={s.error}>{error}</Text>}

      <TouchableOpacity
        style={[s.primaryButton, isSubmitting && s.primaryButtonDisabled]}
        onPress={() => void onSubmit()}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator color={colors.white} size="small" />
        ) : (
          <FontAwesome6
            name="right-to-bracket"
            iconStyle="solid"
            size={16}
            color={colors.white}
          />
        )}
        <Text style={s.primaryButtonText}>{t('auth.login.submit')}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={s.footer}
        onPress={() => navigation.navigate('Register')}
      >
        <Text style={s.footerText}>{t('auth.login.switchToRegister')}</Text>
      </TouchableOpacity>
      </ScrollView>
    </View>
  );
}