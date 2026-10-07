import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import FastImage from '@d11/react-native-fast-image';
import { Icon } from './Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as mediaData from '../data/media';
import { fontSizes, spacing } from '../theme/tokens';
import { Touchable } from './Touchable';
import { ZoomableImage } from './ZoomableImage';

// Full-screen photo viewer. Before this, tapping a photo in a chat did
// nothing at all, and tapping one in the media gallery handed the
// signed URL to the system browser - which left the app entirely to
// show a picture the user had already been sent.
//
// Paging is a horizontal FlatList with pagingEnabled rather than a
// gesture library: swiping between photos is exactly what that does,
// and it needs no native dependency. Zoom (pinch, pan, double tap) is
// layered on each page by ZoomableImage, which turns the pager off while
// a photo is zoomed so a swipe moves around the photo instead.
interface MediaViewerProps {
  // Every photo in the current context (the loaded chat history, or the
  // gallery's photos tab), so the viewer can page between them.
  paths: string[];
  // Which one was tapped; null closes the viewer.
  initialPath: string | null;
  onClose: () => void;
}

function ViewerPage({
  path,
  width,
  height,
  active,
  onZoomChange,
}: {
  path: string;
  width: number;
  height: number;
  active: boolean;
  onZoomChange: (zoomed: boolean) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void mediaData
      .getMediaSignedUrl(path)
      .then((signedUrl) => {
        if (!cancelled) setUrl(signedUrl);
      })
      .catch(() => {
        // Leaves the spinner in place rather than crashing the pager;
        // swiping away and back retries through the URL cache.
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <View style={[styles.page, { width }]}>
      {url ? (
        <ZoomableImage width={width} height={height} active={active} onZoomChange={onZoomChange}>
          <FastImage
            source={{ uri: url }}
            style={styles.image}
            // contain, not cover: this is the view where seeing the whole
            // photo matters more than filling the frame.
            resizeMode={FastImage.resizeMode.contain}
          />
        </ZoomableImage>
      ) : (
        <ActivityIndicator color="#fff" />
      )}
    </View>
  );
}

export function MediaViewer({ paths, initialPath, onClose }: MediaViewerProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const listRef = useRef<FlatList<string>>(null);

  const initialIndex = useMemo(() => {
    const index = initialPath ? paths.indexOf(initialPath) : -1;
    return index >= 0 ? index : 0;
  }, [paths, initialPath]);

  const [index, setIndex] = useState(initialIndex);
  // While the current photo is zoomed, a swipe moves around it rather than
  // to the next photo.
  const [isZoomed, setIsZoomed] = useState(false);

  // Re-sync when a different photo is opened while the component stays
  // mounted - the Modal is rendered by a screen that never unmounts.
  useEffect(() => {
    setIndex(initialIndex);
  }, [initialIndex]);

  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const page = Math.round(event.nativeEvent.contentOffset.x / width);
      setIndex(page);
      setIsZoomed(false);
    },
    [width],
  );

  const getItemLayout = useCallback(
    (_: ArrayLike<string> | null | undefined, i: number) => ({
      length: width,
      offset: width * i,
      index: i,
    }),
    [width],
  );

  const renderItem = useCallback(
    ({ item, index: itemIndex }: { item: string; index: number }) => (
      <ViewerPage
        path={item}
        width={width}
        height={height}
        active={itemIndex === index}
        onZoomChange={setIsZoomed}
      />
    ),
    [width, height, index],
  );

  return (
    <Modal
      visible={initialPath !== null}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      // Photos are worth the full screen, including behind the status bar.
      statusBarTranslucent
    >
      <View style={styles.container}>
        <FlatList
          ref={listRef}
          data={paths}
          keyExtractor={(item) => item}
          renderItem={renderItem}
          horizontal
          pagingEnabled
          scrollEnabled={!isZoomed}
          // renderItem depends on which page is current (to reset the
          // others' zoom); extraData makes the list re-render on a change.
          extraData={index}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={getItemLayout}
          onMomentumScrollEnd={onMomentumScrollEnd}
        />

        <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
          <Touchable
            style={styles.closeButton}
            iconButton
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('mediaGallery.a11yCloseViewer')}
          >
            <Icon name="xmark" size={18} color="#fff" />
          </Touchable>
          {paths.length > 1 && (
            <Text style={styles.counter}>{`${index + 1} / ${paths.length}`}</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

// Deliberately not theme-aware: a photo viewer is black in light mode
// too, so the image is what the eye adjusts to.
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  page: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: { color: '#fff', fontSize: fontSizes.body, fontWeight: '600' },
});
