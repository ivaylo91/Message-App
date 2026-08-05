import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import FastImage from '@d11/react-native-fast-image';
import { getAvatarUrl } from '../data/profiles';
import { avatarColorFor, initialsFor, ThemeColors } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';

interface AvatarProps {
  name: string;
  avatarPath?: string | null;
  size?: number;
  // Undefined hides the dot entirely (e.g. group avatars, where there's
  // no single person's presence to show); true/false renders it green
  // or grey.
  online?: boolean;
}

export function Avatar({ name, avatarPath, size = 48, online }: AvatarProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Avatars live in a private bucket now, so the URL has to be signed
  // (an async fetch) rather than derived synchronously - see
  // 20260807_make_avatars_bucket_private.sql.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const dotSize = Math.max(10, size * 0.3);

  useEffect(() => {
    if (!avatarPath) {
      setAvatarUrl(null);
      return;
    }
    let cancelled = false;
    getAvatarUrl(avatarPath)
      .then((url) => {
        if (!cancelled) setAvatarUrl(url);
      })
      .catch(() => {
        if (!cancelled) setAvatarUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [avatarPath]);

  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: avatarUrl ? colors.line : avatarColorFor(name, colors),
          },
        ]}
      >
        {avatarUrl ? (
          <FastImage
            source={{ uri: avatarUrl }}
            style={{ width: size, height: size, borderRadius: size / 2 }}
          />
        ) : (
          <Text style={[styles.text, { fontSize: size * 0.32 }]}>
            {initialsFor(name)}
          </Text>
        )}
      </View>
      {online !== undefined && (
        <View
          style={[
            styles.statusDot,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              borderWidth: Math.max(2, size * 0.045),
              backgroundColor: online ? colors.sage : colors.smoke,
            },
          ]}
        />
      )}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
      borderColor: colors.paper,
    },
  });
