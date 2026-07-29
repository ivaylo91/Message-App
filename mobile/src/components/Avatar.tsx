import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { getAvatarUrl } from '../data/profiles';
import { avatarColorFor, colors, initialsFor } from '../theme/tokens';

interface AvatarProps {
  name: string;
  avatarPath?: string | null;
  size?: number;
  showStatusDot?: boolean;
}

export function Avatar({ name, avatarPath, size = 48, showStatusDot = false }: AvatarProps) {
  const avatarUrl = avatarPath ? getAvatarUrl(avatarPath) : null;
  const dotSize = Math.max(10, size * 0.3);

  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: avatarUrl ? colors.line : avatarColorFor(name),
          },
        ]}
      >
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={{ width: size, height: size, borderRadius: size / 2 }}
          />
        ) : (
          <Text style={[styles.text, { fontSize: size * 0.32 }]}>
            {initialsFor(name)}
          </Text>
        )}
      </View>
      {showStatusDot && (
        <View
          style={[
            styles.statusDot,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              borderWidth: Math.max(2, size * 0.045),
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  text: {
    color: colors.white,
    fontWeight: '700',
  },
  statusDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    backgroundColor: colors.sage,
    borderColor: colors.paper,
  },
});