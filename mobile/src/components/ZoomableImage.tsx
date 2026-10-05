import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import {
  GestureDetector,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

// Pinch, pan and double-tap zoom for one photo in the viewer. Runs on the
// UI thread, so the photo tracks the fingers exactly.
//
// Panning only exists while zoomed in: at 1x a horizontal drag belongs to
// the viewer's pager, for moving between photos. The parent is told
// whenever zoom starts or ends (onZoomChange) so it can turn paging off
// while you're looking around a zoomed photo, and resets this one through
// `active` when you page away.

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const SPRING = { damping: 22, stiffness: 240 } as const;

interface Props {
  width: number;
  height: number;
  // False once the pager has moved to another photo - this one resets.
  active: boolean;
  onZoomChange: (zoomed: boolean) => void;
  children: React.ReactNode;
}

export function ZoomableImage({ width, height, active, onZoomChange, children }: Props) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  // Mirrors "scale > 1" on the JS side, because it decides whether the pan
  // gesture exists at all - see `enabled` below.
  const [zoomed, setZoomed] = useState(false);
  const reportZoom = useCallback(
    (next: boolean) => {
      setZoomed(next);
      onZoomChange(next);
    },
    [onZoomChange],
  );

  // How far the zoomed photo may move before an edge would come away from
  // the screen's edge.
  const clampX = (x: number, s: number) => {
    'worklet';
    const max = (width * (s - 1)) / 2;
    return Math.min(max, Math.max(-max, x));
  };
  const clampY = (y: number, s: number) => {
    'worklet';
    const max = (height * (s - 1)) / 2;
    return Math.min(max, Math.max(-max, y));
  };

  const settle = (s: number) => {
    'worklet';
    const target = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
    scale.value = withSpring(target, SPRING);
    savedScale.value = target;
    const x = target === 1 ? 0 : clampX(translateX.value, target);
    const y = target === 1 ? 0 : clampY(translateY.value, target);
    translateX.value = withSpring(x, SPRING);
    translateY.value = withSpring(y, SPRING);
    savedX.value = x;
    savedY.value = y;
    scheduleOnRN(reportZoom, target > 1);
  };

  const pinch = usePinchGesture({
    onUpdate: (event) => {
      'worklet';
      // A little give past the limits while pinching, settled on release.
      scale.value = Math.min(MAX_SCALE * 1.2, Math.max(MIN_SCALE * 0.8, savedScale.value * event.scale));
    },
    onDeactivate: () => {
      'worklet';
      settle(scale.value);
    },
  });

  const pan = usePanGesture({
    // Only while zoomed. At 1x an enabled pan would claim every horizontal
    // drag - even one it then ignored - and the pager could never page.
    enabled: zoomed,
    // Two fingers are the pinch's; panning is one finger moving a zoomed
    // photo around.
    maxPointers: 1,
    onUpdate: (event) => {
      'worklet';
      if (savedScale.value <= 1) return;
      translateX.value = clampX(savedX.value + event.translationX, scale.value);
      translateY.value = clampY(savedY.value + event.translationY, scale.value);
    },
    onDeactivate: () => {
      'worklet';
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    },
  });

  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    onDeactivate: (event) => {
      'worklet';
      if (event.canceled) return;
      settle(savedScale.value > 1 ? 1 : DOUBLE_TAP_SCALE);
    },
  });

  const gesture = useSimultaneousGestures(pinch, pan, doubleTap);

  // Paging away resets this photo, so it's at 1x when you come back.
  useEffect(() => {
    if (active) return;
    setZoomed(false);
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedX.value = 0;
    savedY.value = 0;
  }, [active, scale, savedScale, translateX, translateY, savedX, savedY]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.fill, style]}>{children}</Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
});
