import React from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { Lucide } from '@react-native-vector-icons/lucide/static';

// Every icon in the app goes through here. The set is Lucide - rounded
// line icons, in keeping with Hearth's soft bubbles and rounded display
// face - replacing FontAwesome's heavy solid set.
//
// The app names icons by meaning-ish keys (the FontAwesome names it grew
// up with); this table is the one place they map to glyphs. The table is
// type-checked against Lucide's glyph map, so a mistyped glyph fails the
// build instead of rendering an empty box, and swapping the whole icon
// set again is a change to this file alone.
const GLYPHS = {
  'arrow-down-left': 'arrow-down-left',
  'arrow-up-right': 'arrow-up-right',
  'arrow-up-right-from-square': 'external-link',
  bell: 'bell',
  'bell-slash': 'bell-off',
  camera: 'camera',
  'camera-rotate': 'switch-camera',
  check: 'check',
  'check-double': 'check-check',
  'chevron-down': 'chevron-down',
  'chevron-left': 'chevron-left',
  clock: 'clock',
  'cloud-arrow-down': 'cloud-download',
  comment: 'message-circle',
  'comment-dots': 'message-circle-more',
  comments: 'messages-square',
  copy: 'copy',
  'ellipsis-vertical': 'ellipsis-vertical',
  eye: 'eye',
  'eye-slash': 'eye-off',
  'face-smile': 'smile',
  file: 'file',
  'file-audio': 'file-music',
  'file-image': 'file-image',
  'file-lines': 'file-text',
  'file-pdf': 'file-text',
  'file-video': 'file-play',
  'file-word': 'file-text',
  'file-zipper': 'file-archive',
  flag: 'flag',
  heart: 'heart',
  images: 'images',
  'magnifying-glass': 'search',
  microphone: 'mic',
  'microphone-slash': 'mic-off',
  'paper-plane': 'send',
  paperclip: 'paperclip',
  pause: 'pause',
  pen: 'pencil',
  'pen-to-square': 'square-pen',
  phone: 'phone',
  'phone-slash': 'phone-off',
  play: 'play',
  plus: 'plus',
  reply: 'reply',
  'right-from-bracket': 'log-out',
  'right-to-bracket': 'log-in',
  share: 'forward',
  'shield-halved': 'shield',
  'thumbs-up': 'thumbs-up',
  thumbtack: 'pin',
  trash: 'trash-2',
  user: 'user',
  'user-minus': 'user-minus',
  'user-plus': 'user-plus',
  users: 'users',
  video: 'video',
  'video-slash': 'video-off',
  xmark: 'x',
} as const satisfies Record<string, React.ComponentProps<typeof Lucide>['name']>;

export type IconName = keyof typeof GLYPHS;

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}

export function Icon({ name, size = 20, color, style, accessibilityLabel }: IconProps) {
  return (
    <Lucide
      name={GLYPHS[name]}
      size={size}
      color={color}
      style={style}
      accessibilityLabel={accessibilityLabel}
      // Decorative unless labelled - most icons sit inside a button that
      // carries the label.
      accessible={Boolean(accessibilityLabel)}
    />
  );
}
