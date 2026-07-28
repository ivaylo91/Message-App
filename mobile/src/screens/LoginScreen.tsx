import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../auth/AuthContext';
import { authStyles as s } from './authStyles';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
    } catch {
      setError(t('auth.login.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
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
      <View style={s.field}>
        <Text style={s.label}>{t('auth.login.passwordLabel')}</Text>
        <TextInput
          style={s.input}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
      </View>

      {error && <Text style={s.error}>{error}</Text>}

      {isSubmitting ? (
        <ActivityIndicator color="#E8622C" style={s.spinner} />
      ) : (
        <TouchableOpacity style={s.primaryButton} onPress={() => void onSubmit()}>
          <Text style={s.primaryButtonText}>{t('auth.login.submit')}</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={s.footer}
        onPress={() => navigation.navigate('Register')}
      >
        <Text style={s.footerText}>{t('auth.login.switchToRegister')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}