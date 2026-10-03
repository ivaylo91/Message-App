import React, { useMemo } from 'react';
import { Modal, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import { FontAwesome6 } from '@react-native-vector-icons/fontawesome6/static';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Touchable } from './Touchable';
import { elevation, fontSizes, radii, spacing, ThemeColors } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';

// The long-press menu for a message, replacing the strip that used to open
// under the bubble - which scrolled sideways and hid Forward, Edit, Delete
// and Report off the edge of the screen with nothing to suggest they were
// there. Here every action is a labelled row, and the message itself is
// lifted above a dimmed chat so it's unmistakable which one you're acting
// on.

// Listed rather than taking any FontAwesome name: the full set includes
// brand icons that don't exist in the solid style this menu renders.
export type MessageMenuIcon = 'reply' | 'copy' | 'share' | 'pen' | 'trash' | 'flag';

export interface MessageMenuAction {
  id: string;
  label: string;
  icon: MessageMenuIcon;
  destructive?: boolean;
  onPress: () => void;
}

export interface MessageMenuTarget {
  // Where the bubble sits on screen (window coordinates), so the lifted
  // copy appears in place instead of jumping to the middle.
  anchorY: number;
  anchorHeight: number;
  isMine: boolean;
  previewText: string;
}

interface Props {
  target: MessageMenuTarget | null;
  // Empty hides the reaction bar - e.g. for a message still sending, which
  // has nothing on the server yet to react to.
  reactions: readonly string[];
  // The emojis this user has already reacted with, shown selected so a tap
  // reads as the toggle it is.
  reactedEmojis: ReadonlySet<string>;
  actions: MessageMenuAction[];
  onReact: (emoji: string) => void;
  onClose: () => void;
}

const REACTION_BAR_HEIGHT = 52;
const ACTION_ROW_HEIGHT = 48;
const GAP = spacing.sm;
// Long messages are cut off in the lifted copy rather than pushing the
// actions off screen - the full text is still right there in the chat.
const PREVIEW_MAX_HEIGHT = 168;
const MENU_WIDTH = 232;

export function MessageMenu({
  target,
  reactions,
  reactedEmojis,
  actions,
  onReact,
  onClose,
}: Props) {
  const { colors, gradients } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  // Positioned from heights known up front rather than measured after
  // render, so the menu opens in its final place instead of jumping once
  // it has been laid out.
  const top = useMemo(() => {
    if (!target) return 0;
    const reactionsHeight = reactions.length > 0 ? REACTION_BAR_HEIGHT + GAP : 0;
    const previewHeight = Math.min(target.anchorHeight, PREVIEW_MAX_HEIGHT);
    const actionsHeight = actions.length * ACTION_ROW_HEIGHT + spacing.sm * 2;
    const stackHeight = reactionsHeight + previewHeight + GAP + actionsHeight;
    const desired = target.anchorY - reactionsHeight;
    const min = insets.top + spacing.md;
    const max = windowHeight - insets.bottom - spacing.md - stackHeight;
    // On a message near the bottom the whole stack slides up to fit; one
    // too tall for the screen at all keeps its top edge visible.
    return Math.max(min, Math.min(desired, max));
  }, [target, reactions.length, actions.length, insets, windowHeight]);

  const align = target?.isMine ? styles.alignEnd : styles.alignStart;

  return (
    <Modal
      visible={target !== null}
      transparent
      animationType="none"
      // Full-window, so the bubble's measured position maps straight onto
      // the menu's coordinates with no status-bar offset to correct for.
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      {target && (
        <>
          <Animated.View
            // Entry only: closing hides the Modal at once, so an exit
            // animation here would never be seen - and an instant close is
            // what you want after picking an action anyway.
            entering={FadeIn.duration(160)}
            style={[StyleSheet.absoluteFill, styles.scrim]}
          >
            <Touchable
              style={StyleSheet.absoluteFill}
              onPress={onClose}
              ripple={null}
              accessibilityRole="button"
            />
          </Animated.View>

          {/* box-none: taps between the pieces fall through to the scrim. */}
          <View style={[styles.stack, align, { top }]} pointerEvents="box-none">
            {reactions.length > 0 && (
              <Animated.View
                entering={ZoomIn.springify().damping(18).stiffness(280)}
                style={styles.reactionBar}
              >
                {reactions.map((emoji) => {
                  const selected = reactedEmojis.has(emoji);
                  return (
                    <Touchable
                      key={emoji}
                      style={[styles.reaction, selected && styles.reactionSelected]}
                      onPress={() => onReact(emoji)}
                      pressScale
                      ripple={null}
                      accessibilityRole="button"
                      accessibilityLabel={emoji}
                      accessibilityState={{ selected }}
                    >
                      <Text style={styles.reactionText}>{emoji}</Text>
                    </Touchable>
                  );
                })}
              </Animated.View>
            )}

            <Animated.View entering={FadeIn.duration(140)} pointerEvents="none">
              <LinearGradient
                colors={target.isMine ? [...gradients.mine] : [...gradients.theirs]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.preview}
              >
                <Text
                  style={target.isMine ? styles.previewTextMine : styles.previewTextTheirs}
                  numberOfLines={7}
                >
                  {target.previewText}
                </Text>
              </LinearGradient>
            </Animated.View>

            <Animated.View
              entering={ZoomIn.springify().damping(20).stiffness(300)}
              style={styles.actions}
            >
              {actions.map((action, index) => (
                <Touchable
                  key={action.id}
                  style={[styles.actionRow, index > 0 && styles.actionDivider]}
                  onPress={action.onPress}
                  accessibilityRole="button"
                >
                  <Text
                    style={[styles.actionLabel, action.destructive && styles.destructive]}
                  >
                    {action.label}
                  </Text>
                  <FontAwesome6
                    name={action.icon}
                    iconStyle="solid"
                    size={15}
                    color={action.destructive ? colors.danger : colors.smoke}
                  />
                </Touchable>
              ))}
            </Animated.View>
          </View>
        </>
      )}
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    scrim: { backgroundColor: 'rgba(0,0,0,0.55)' },
    stack: {
      position: 'absolute',
      left: spacing.md,
      right: spacing.md,
      gap: GAP,
    },
    alignStart: { alignItems: 'flex-start' },
    alignEnd: { alignItems: 'flex-end' },
    reactionBar: {
      height: REACTION_BAR_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.xs,
      borderRadius: radii.pill,
      backgroundColor: colors.paper2,
      ...elevation.md,
    },
    reaction: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
    },
    reactionSelected: { backgroundColor: colors.line },
    reactionText: { fontSize: 26 },
    preview: {
      maxWidth: '85%',
      maxHeight: PREVIEW_MAX_HEIGHT,
      overflow: 'hidden',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: radii.bubble,
    },
    // Same type as the bubble it copies (bubbleTextMine/Theirs in ChatScreen).
    previewTextMine: { fontSize: fontSizes.body, lineHeight: 20, color: colors.white },
    previewTextTheirs: { fontSize: fontSizes.body, lineHeight: 20, color: colors.ink },
    actions: {
      width: MENU_WIDTH,
      paddingVertical: spacing.sm,
      borderRadius: radii.lg,
      backgroundColor: colors.paper2,
      ...elevation.lg,
    },
    actionRow: {
      height: ACTION_ROW_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
    },
    actionDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
    },
    actionLabel: { fontSize: fontSizes.body, color: colors.ink },
    destructive: { color: colors.danger },
  });
