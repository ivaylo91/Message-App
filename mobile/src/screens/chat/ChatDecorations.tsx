import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Skeleton, SkeletonGroup } from '../../components/Skeleton';
import { radii } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeContext';
import { makeStyles } from './chatStyles';

const TYPING_DOT_BOUNCE_MS = 300;
const TYPING_DOT_STAGGER_MS = 150;

function TypingDot({ delay }: { delay: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const bounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(bounce, {
          toValue: 1,
          duration: TYPING_DOT_BOUNCE_MS,
          useNativeDriver: true,
        }),
        Animated.timing(bounce, {
          toValue: 0,
          duration: TYPING_DOT_BOUNCE_MS,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bounce, delay]);

  return (
    <Animated.View
      style={[
        styles.typingDot,
        {
          opacity: bounce.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
          transform: [
            {
              translateY: bounce.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }),
            },
          ],
        },
      ]}
    />
  );
}

// Rendered as the FlatList's ListHeaderComponent - since the list is
// inverted, the "header" slot visually sits at the bottom, right where
// the other person's next message would appear.
export function TypingBubble() {
  const { colors, gradients } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.rowTheirs}>
      <LinearGradient
        colors={[...gradients.theirs]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.bubble, styles.typingBubble]}
      >
        <TypingDot delay={0} />
        <TypingDot delay={TYPING_DOT_STAGGER_MS} />
        <TypingDot delay={TYPING_DOT_STAGGER_MS * 2} />
      </LinearGradient>
    </View>
  );
}

// Alternating sides at varied widths, so the wait looks like a
// conversation arriving rather than a loading bar. Opening a chat used to
// show a blank area until the first page resolved.
const SKELETON_BUBBLES: { mine: boolean; width: number }[] = [
  { mine: false, width: 0.62 },
  { mine: true, width: 0.45 },
  { mine: false, width: 0.78 },
  { mine: true, width: 0.55 },
  { mine: false, width: 0.4 },
  { mine: true, width: 0.7 },
];

export function ChatHistorySkeleton({ bubbleMaxWidth }: { bubbleMaxWidth: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <SkeletonGroup style={styles.historySkeleton}>
      {SKELETON_BUBBLES.map((bubble, i) => (
        <View key={i} style={bubble.mine ? styles.rowMine : styles.rowTheirs}>
          <Skeleton
            width={Math.round(bubbleMaxWidth * bubble.width)}
            height={bubble.mine ? 38 : 48}
            radius={radii.bubble}
          />
        </View>
      ))}
    </SkeletonGroup>
  );
}
