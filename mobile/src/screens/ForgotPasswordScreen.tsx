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
import { useContentWidth } from '../hooks/useContentWidth';
import { spacing } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';
import { makeAuthStyles } from './authStyles';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export function ForgotPasswordScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { requestPasswordReset } = useAuth();
  const insets = useSafeAreaInsets();
  const { contentWidth } = useContentWidth();
  const { colors } = useTheme();
  const s = useMemo(() => makeAuthStyles(colors), [colors]);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (!email.trim()) return;
    setIsSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
      setIsSent(true);
    } catch {
      setError(t('auth.forgotPassword.error'));
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
        <Text style={s.title}>{t('auth.forgotPassword.title')}</Text>
        <Text style={s.subtitle}>{t('auth.forgotPassword.subtitle')}</Text>

        {isSent ? (
          <Text style={s.info}>{t('auth.forgotPassword.sentInfo')}</Text>
        ) : (
          <>
            <View style={s.field}>
              <Text style={s.label}>{t('auth.forgotPassword.emailLabel')}</Text>
              <TextInput
                style={s.input}
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
            </View>

            {error && <Text style={s.error}>{error}</Text>}

            <TouchableOpacity
              style={[s.primaryButton, (isSubmitting || !email.trim()) && s.primaryButtonDisabled]}
              onPress={() => void onSubmit()}
              disabled={isSubmitting || !email.trim()}
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <FontAwesome6 name="paper-plane" iconStyle="solid" size={16} color={colors.white} />
              )}
              <Text style={s.primaryButtonText}>{t('auth.forgotPassword.submit')}</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity style={s.footer} onPress={() => navigation.navigate('Login')}>
          <Text style={s.footerText}>{t('auth.forgotPassword.backToLogin')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
