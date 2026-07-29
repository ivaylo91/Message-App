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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../auth/AuthContext';
import { AppBackground } from '../components/AppBackground';
import { PasswordField } from '../components/PasswordField';
import { useContentWidth } from '../hooks/useContentWidth';
import { colors, spacing } from '../theme/tokens';
import { authStyles as s } from './authStyles';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export function RegisterScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { register } = useAuth();
  const insets = useSafeAreaInsets();
  const { contentWidth } = useContentWidth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setInfoMessage(null);
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
      if (needsEmailConfirmation) {
        setInfoMessage(t('auth.register.confirmEmailInfo'));
      }
    } catch {
      setError(t('auth.register.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <AppBackground />
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
      <PasswordField
        label={t('auth.register.confirmPasswordLabel')}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
      />

      {error && <Text style={s.error}>{error}</Text>}
      {infoMessage && <Text style={s.info}>{infoMessage}</Text>}

      {isSubmitting ? (
        <ActivityIndicator color="#E8622C" style={s.spinner} />
      ) : (
        <TouchableOpacity style={s.primaryButton} onPress={() => void onSubmit()}>
          <Text style={s.primaryButtonText}>{t('auth.register.submit')}</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={s.footer} onPress={() => navigation.navigate('Login')}>
        <Text style={s.footerText}>{t('auth.register.switchToLogin')}</Text>
      </TouchableOpacity>
      </ScrollView>
    </View>
  );
}