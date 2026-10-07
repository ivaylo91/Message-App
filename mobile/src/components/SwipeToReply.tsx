import React from 'react';
import { StyleSheet } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  Extrapolation,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { FontAwesome6 } from '@react-native-vector-icons/fontawesome6/static';
import { haptic } from '../utils/haptics';
import { SPRING_TAP } from '../theme/motion';

// Drag a message to the right to reply to it. The drag runs on the UI
// thread (Gesture Handler + Reanimated), so the bubble stays under the
// finger even while the JS thread is busy rendering the chat - which is
// what PanResponder couldn't promise.

// How far to drag before letting go means "reply". Past it the bubble
// resists (see RESISTANCE), which is the felt signal that it has
// registered - along with one haptic tick on crossing.
const THRESHOLD = 64;
const RESISTANCE = 0.3;
const MAX_TRAVEL = THRESHOLD + 36;

interface Props {
  enabled: boolean;
  onReply: () => void;
  iconColor: string;
  children: React.ReactNode;
}

export function SwipeToReply({ enabled, onReply, iconColor, children }: Props) {
  const translateX = useSharedValue(0);
  const armed = useSharedValue(false);

  const pan = usePanGesture({
    enabled,
    // A single positive number means "activate only after moving 12pt to
    // the right": a leftward drag never starts it, and a vertical move
    // fails it first so the chat keeps scrolling normally. Long-press
    // still reaches the bubble, since nothing activates without movement.
    activeOffsetX: 12,
    failOffsetY: [-12, 12],
    onUpdate: (event) => {
      'worklet';
      const dx = Math.max(0, event.translationX);
      translateX.value =
        dx <= THRESHOLD ? dx : Math.min(MAX_TRAVEL, THRESHOLD + (dx - THRESHOLD) * RESISTANCE);
      const past = dx >= THRESHOLD;
      if (past !== armed.value) {
        armed.value = past;
        // Only on the way across, not when backing off again.
        if (past) scheduleOnRN(haptic, 'select');
      }
    },
    onDeactivate: () => {
      'worklet';
      if (armed.value) scheduleOnRN(onReply);
    },
    onFinalize: () => {
      'worklet';
      armed.value = false;
      translateX.value = withSpring(0, SPRING_TAP);
    },
  });

  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Revealed in the space the bubble leaves behind, growing in as the
  // drag approaches the threshold.
  const iconStyle = useAnimatedStyle(() => {
    const progress = interpolate(translateX.value, [0, THRESHOLD], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: progress,
      transform: [{ scale: 0.6 + progress * 0.4 }],
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View>
        <Animated.View style={[styles.icon, iconStyle]} pointerEvents="none">
          <FontAwesome6 name="reply" iconStyle="solid" size={16} color={iconColor} />
        </Animated.View>
        <Animated.View style={bubbleStyle}>{children}</Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  icon: {
    position: 'absolute',
    left: 8,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
});
