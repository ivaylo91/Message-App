import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { FontAwesome6 } from '@react-native-vector-icons/fontawesome6/static';
import { fontSizes, radii, spacing, ThemeColors } from '../theme/tokens';
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
          <FontAwesome6
            name={visible ? 'eye-slash' : 'eye'}
            iconStyle="solid"
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
    field: { marginBottom: spacing.lg },
    label: {
      fontSize: fontSizes.caption,
      fontWeight: '700',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: colors.smoke,
      marginBottom: 7,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.paper2,
      borderRadius: radii.md,
    },
    input: {
      flex: 1,
      padding: 13,
      fontSize: fontSizes.body,
      color: colors.ink,
    },
    toggle: { paddingHorizontal: 13 },
  });
