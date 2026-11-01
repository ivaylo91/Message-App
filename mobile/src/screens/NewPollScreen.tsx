import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { AppStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { Touchable } from '../components/Touchable';
import * as conversationsData from '../data/conversations';
import { useContentWidth } from '../hooks/useContentWidth';
import {
  cleanPollDraft,
  MAX_OPTION_LENGTH,
  MAX_POLL_OPTIONS,
  MAX_QUESTION_LENGTH,
  MIN_POLL_OPTIONS,
} from '../polls/polls';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, radii, spacing, ThemeColors } from '../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'NewPoll'>;

export function NewPollScreen({ navigation, route }: Props) {
  const { conversationId } = route.params;
  const { t } = useTranslation();
  const { userId } = useAuth();
  const { showToast } = useToast();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { contentWidth } = useContentWidth();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [isSending, setIsSending] = useState(false);

  const draft = cleanPollDraft(question, options);

  const onChangeOption = (index: number, text: string) => {
    setOptions((current) => current.map((option, i) => (i === index ? text : option)));
  };

  const onRemoveOption = (index: number) => {
    setOptions((current) => current.filter((_, i) => i !== index));
  };

  const onSend = async () => {
    if (!draft || !userId || isSending) return;
    setIsSending(true);
    try {
      await conversationsData.sendPollMessage(conversationId, userId, draft.question, draft.options);
      navigation.goBack();
    } catch {
      setIsSending(false);
      showToast(t('polls.sendFailedToast'), 'error');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <KeyboardAvoidingView behavior="padding" style={[styles.content, { maxWidth: contentWidth }]}>
        <View style={styles.header}>
          <Touchable
            style={styles.backButton}
            iconButton
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel={t('chat.a11yBack')}
          >
            <Icon name="chevron-left" size={22} color={colors.ink} />
          </Touchable>
          <Text style={styles.title} accessibilityRole="header">
            {t('polls.title')}
          </Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.label}>{t('polls.questionLabel')}</Text>
          <TextInput
            style={[styles.input, styles.question]}
            value={question}
            onChangeText={setQuestion}
            placeholder={t('polls.questionPlaceholder')}
            placeholderTextColor={colors.smoke}
            maxLength={MAX_QUESTION_LENGTH}
            multiline
            autoFocus
            accessibilityLabel={t('polls.questionLabel')}
          />

          <Text style={styles.label}>{t('polls.optionsLabel')}</Text>
          {options.map((option, index) => {
            const placeholder = t('polls.optionPlaceholder', { n: index + 1 });
            return (
              // By position: rows have no identity of their own, and removing
              // one moves the text of the rows after it up with it.
              <View key={index} style={styles.optionRow}>
                <TextInput
                  style={[styles.input, styles.optionInput]}
                  value={option}
                  onChangeText={(text) => onChangeOption(index, text)}
                  placeholder={placeholder}
                  placeholderTextColor={colors.smoke}
                  maxLength={MAX_OPTION_LENGTH}
                  accessibilityLabel={placeholder}
                />
                {options.length > MIN_POLL_OPTIONS && (
                  <Touchable
                    style={styles.removeButton}
                    iconButton
                    onPress={() => onRemoveOption(index)}
                    accessibilityRole="button"
                    accessibilityLabel={t('polls.removeOption', { n: index + 1 })}
                  >
                    <Icon name="xmark" size={16} color={colors.smoke} />
                  </Touchable>
                )}
              </View>
            );
          })}

          {options.length < MAX_POLL_OPTIONS && (
            <Touchable
              style={styles.addOption}
              onPress={() => setOptions((current) => [...current, ''])}
              accessibilityRole="button"
            >
              <Icon name="plus" size={16} color={colors.emberText} />
              <Text style={styles.addOptionText}>{t('polls.addOption')}</Text>
            </Touchable>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Touchable
            style={[styles.send, (!draft || isSending) && styles.sendDisabled]}
            onPress={() => void onSend()}
            disabled={!draft || isSending}
            accessibilityRole="button"
            accessibilityState={{ disabled: !draft || isSending }}
          >
            <Text style={styles.sendText}>{t('polls.send')}</Text>
          </Touchable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    content: { flex: 1, width: '100%', alignSelf: 'center' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
    },
    backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    title: { fontFamily: fonts.family, fontSize: fontSizes.title, fontWeight: '800', color: colors.ink },
    scroll: { flex: 1 },
    form: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
    label: {
      marginTop: spacing.sm,
      fontFamily: fonts.family,
      fontSize: fontSizes.footnote,
      fontWeight: '700',
      color: colors.char,
    },
    input: {
      minHeight: 48,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.md,
      fontFamily: fonts.family,
      fontSize: fontSizes.body,
      color: colors.ink,
      backgroundColor: colors.paper2,
    },
    question: { minHeight: 76, textAlignVertical: 'top' },
    optionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    optionInput: { flex: 1, minWidth: 0 },
    removeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    addOption: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      alignSelf: 'flex-start',
    },
    addOptionText: {
      fontFamily: fonts.family,
      fontSize: fontSizes.body,
      fontWeight: '600',
      color: colors.emberText,
    },
    footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
    send: {
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.pill,
      backgroundColor: colors.ember,
    },
    sendDisabled: { opacity: 0.45 },
    sendText: { fontFamily: fonts.family, fontSize: fontSizes.body, fontWeight: '700', color: '#FFFFFF' },
  });
