import React, { useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { FontAwesome6 } from '@react-native-vector-icons/fontawesome6/static';
import { useTheme } from '../theme/ThemeContext';

// A fixed (non-scrolling) wallpaper shown behind every screen, echoing the
// doodle-pattern chat backgrounds in Viber/WhatsApp: a brick-offset grid
// of assorted chat/communication icons, faint enough to sit behind real
// content (lists, text, forms, message bubbles) without hurting readability.
const ICON_NAMES = [
  'comment',
  'comment-dots',
  'comments',
  'paper-plane',
  'heart',
  'thumbs-up',
  'face-smile',
  'phone',
] as const;

const CELL_SIZE = 76;
const ICON_SIZE = 20;
const ICON_OPACITY = 0.08;
// Every 4th icon picks up a touch of brand color instead of plain ink,
// so the pattern isn't perfectly monochrome.
const ACCENT_EVERY = 4;

interface WallpaperIcon {
  key: string;
  name: (typeof ICON_NAMES)[number];
  top: number;
  left: number;
  color: string;
}

export function AppWallpaper() {
  const { colors } = useTheme();
  const icons = useMemo<WallpaperIcon[]>(() => {
    const { width, height } = Dimensions.get('window');
    const columns = Math.ceil(width / CELL_SIZE) + 1;
    const rows = Math.ceil(height / CELL_SIZE) + 1;

    const items: WallpaperIcon[] = [];
    let index = 0;
    for (let row = 0; row < rows; row++) {
      const rowOffset = row % 2 === 0 ? 0 : CELL_SIZE / 2;
      for (let col = 0; col < columns; col++) {
        items.push({
          key: `${row}-${col}`,
          name: ICON_NAMES[index % ICON_NAMES.length],
          top: row * CELL_SIZE,
          left: col * CELL_SIZE + rowOffset,
          color: index % ACCENT_EVERY === 0 ? colors.ember : colors.ink,
        });
        index++;
      }
    }
    return items;
  }, [colors]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {icons.map((icon) => (
        <FontAwesome6
          key={icon.key}
          name={icon.name}
          iconStyle="solid"
          size={ICON_SIZE}
          color={icon.color}
          style={[styles.icon, { top: icon.top, left: icon.left }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  icon: {
    position: 'absolute',
    opacity: ICON_OPACITY,
  },
});
