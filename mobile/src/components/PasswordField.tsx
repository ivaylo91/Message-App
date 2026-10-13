import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Icon } from './Icon';
import { fonts, fontSizes, spacing, ThemeColors } from '../theme/tokens';
import { Touchable } from './Touchable';
import { useTheme } from '../theme/ThemeContext';

interface PasswordFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
}

export function PasswordField({ label, value, onChangeText }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          secureTextEntry={!visible}
          autoCapitalize="none"
          value={value}
          onChangeText={onChangeText}
        />
        <Touchable
          style={styles.toggle}
          iconButton
          onPress={() => setVisible((current) => !current)}
        >
          <Icon
            name={visible ? 'eye-slash' : 'eye'}
            size={18}
            color={colors.smoke}
          />
        </Touchable>
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    field: { marginBottom: 14 },
    label: {
      fontFamily: fonts.family,
      fontSize: fontSizes.footnote,
      fontWeight: '600',
      color: colors.char,
      marginBottom: 6,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 54,
      paddingRight: 5,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.paper2,
      borderRadius: 16,
    },
    input: {
      fontFamily: fonts.family,
      flex: 1,
      paddingHorizontal: spacing.lg,
      paddingVertical: 14,
      fontSize: 16,
      color: colors.ink,
    },
    toggle: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  });
