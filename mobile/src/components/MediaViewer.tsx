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
import { FontAwesome6 } from '@react-native-vector-icons/fontawesome6/static';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as mediaData from '../data/media';
import { fontSizes, spacing } from '../theme/tokens';
import { Touchable } from './Touchable';

// Full-screen photo viewer. Before this, tapping a photo in a chat did
// nothing at all, and tapping one in the media gallery handed the
// signed URL to the system browser - which left the app entirely to
// show a picture the user had already been sent.
//
// Paging is a horizontal FlatList with pagingEnabled rather than a
// gesture library: swiping between photos is exactly what that does,
// and it needs no native dependency. Pinch-to-zoom is the one thing
// genuinely missing, and it *would* need react-native-gesture-handler.
interface MediaViewerProps {
  // Every photo in the current context (the loaded chat history, or the
  // gallery's photos tab), so the viewer can page between them.
  paths: string[];
  // Which one was tapped; null closes the viewer.
  initialPath: string | null;
  onClose: () => void;
}

function ViewerPage({ path, width }: { path: string; width: number }) {
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
        <FastImage
          source={{ uri: url }}
          style={styles.image}
          // contain, not cover: this is the view where seeing the whole
          // photo matters more than filling the frame.
          resizeMode={FastImage.resizeMode.contain}
        />
      ) : (
        <ActivityIndicator color="#fff" />
      )}
    </View>
  );
}

export function MediaViewer({ paths, initialPath, onClose }: MediaViewerProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<string>>(null);

  const initialIndex = useMemo(() => {
    const index = initialPath ? paths.indexOf(initialPath) : -1;
    return index >= 0 ? index : 0;
  }, [paths, initialPath]);

  const [index, setIndex] = useState(initialIndex);

  // Re-sync when a different photo is opened while the component stays
  // mounted - the Modal is rendered by a screen that never unmounts.
  useEffect(() => {
    setIndex(initialIndex);
  }, [initialIndex]);

  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const page = Math.round(event.nativeEvent.contentOffset.x / width);
      setIndex(page);
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
    ({ item }: { item: string }) => <ViewerPage path={item} width={width} />,
    [width],
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
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={getItemLayout}
          onMomentumScrollEnd={onMomentumScrollEnd}
        />

        <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
          <Touchable
            style={styles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('mediaGallery.a11yCloseViewer')}
          >
            <FontAwesome6 name="xmark" iconStyle="solid" size={18} color="#fff" />
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
