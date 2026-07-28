import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { avatarColorFor, colors, initialsFor } from '../theme/tokens';

interface AvatarProps {
  name: string;
  size?: number;
}

export function Avatar({ name, size = 48 }: AvatarProps) {
  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: avatarColorFor(name),
        },
      ]}
    >
      <Text style={[styles.text, { fontSize: size * 0.32 }]}>
        {initialsFor(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: colors.white,
    fontWeight: '700',
  },
});