import React, { memo, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { FontAwesome6 } from '@react-native-vector-icons/fontawesome6/static';
import { useTheme } from '../theme/ThemeContext';

// A fixed (non-scrolling) wallpaper echoing the doodle-pattern chat
// backgrounds in Viber/WhatsApp: a brick-offset grid of assorted
// chat/communication icons, faint enough to sit behind real content
// without hurting readability.
//
// Used on the chat surface and the unauthenticated brand flow (welcome,
// login, register, forgot password) - not on every screen as it once was.
// Behind bubbles it reads as a chat wallpaper, which is the point; behind
// the conversation list, profile, settings and group info it just added
// visual noise to screens where the content is the thing being read.
// WhatsApp and Signal draw the same line: textured thread, clean list.
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

function AppWallpaperComponent() {
  const { colors } = useTheme();
  // Was Dimensions.get('window'), read once inside a memo keyed only on
  // the theme - so the grid was sized for whatever the screen was at
  // first render and never recomputed. Rotating the device, or resizing a
  // split-screen/foldable window, left the pattern covering only part of
  // the wider dimension.
  const { width, height } = useWindowDimensions();

  const icons = useMemo<WallpaperIcon[]>(() => {
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
  }, [colors, width, height]);

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

// Memoised because it takes no props and is expensive for what it is:
// the grid is ~98 absolutely-positioned icon views on a phone and ~216 on
// a tablet, and it is rendered inside ChatScreen - which re-renders on
// every keystroke in the composer. Without this, every character typed
// reconciled a hundred-odd background views. It still re-renders when the
// theme or the window size changes, since both arrive through hooks
// rather than props.
export const AppWallpaper = memo(AppWallpaperComponent);

const styles = StyleSheet.create({
  icon: {
    position: 'absolute',
    opacity: ICON_OPACITY,
  },
});
