import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, radii, spacing } from '../theme/tokens';

interface PasswordFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
}

export function PasswordField({ label, value, onChangeText }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

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
        <TouchableOpacity
          style={styles.toggle}
          onPress={() => setVisible((current) => !current)}
        >
          <Text style={styles.toggleText}>{visible ? '🙈' : '👁️'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: spacing.lg },
  label: {
    fontSize: 12,
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
    fontSize: 15,
    color: colors.ink,
  },
  toggle: { paddingHorizontal: 13 },
  toggleText: { fontSize: 18 },
});