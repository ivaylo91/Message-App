import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import FastImage from '@d11/react-native-fast-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../components/Icon';
import { Touchable } from '../../components/Touchable';
import { fetchGifs, type GifResult } from '../../data/giphy';
import { useTheme } from '../../theme/ThemeContext';
import {
  fonts,
  fontSizes,
  MAX_CONTENT_WIDTH,
  radii,
  spacing,
  ThemeColors,
} from '../../theme/tokens';

// Long enough that typing a word costs one request, not one per letter: a
// beta GIPHY key allows 100 calls an hour, shared by everyone using the app.
const SEARCH_DEBOUNCE_MS = 400;
const GRID_GAP = spacing.xs;
const MIN_COLUMN_WIDTH = 170;

interface GifPickerProps {
  onClose: () => void;
  onPick: (gif: GifResult) => void;
}

// Mounted only while open, so each opening starts on what's trending and a
// closed picker makes no requests.
export function GifPicker({ onClose, onPick }: GifPickerProps) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const nextOffset = useRef<number | null>(null);
  // Only the newest search may fill the grid: an earlier one can answer last.
  const latestRequest = useRef(0);

  const contentWidth = Math.min(width, MAX_CONTENT_WIDTH);
  const columns = Math.max(2, Math.floor(contentWidth / MIN_COLUMN_WIDTH));
  const cellSize = (contentWidth - spacing.md * 2 - GRID_GAP * (columns - 1)) / columns;
  const language = i18n.language;

  const loadFirstPage = useCallback(
    (term: string) => {
      const request = ++latestRequest.current;
      setStatus('loading');
      fetchGifs(term, 0, language)
        .then((page) => {
          if (request !== latestRequest.current) return;
          setGifs(page.gifs);
          nextOffset.current = page.nextOffset;
          setStatus('ready');
        })
        .catch(() => {
          if (request === latestRequest.current) setStatus('error');
        });
    },
    [language],
  );

  useEffect(() => {
    const term = query.trim();
    const timer = setTimeout(() => loadFirstPage(term), term ? SEARCH_DEBOUNCE_MS : 0);
    return () => clearTimeout(timer);
  }, [query, loadFirstPage]);

  const onEndReached = () => {
    const offset = nextOffset.current;
    if (offset === null || status !== 'ready') return;
    // Cleared while it's in flight, so a second scroll event can't fetch it twice.
    nextOffset.current = null;
    const request = latestRequest.current;
    fetchGifs(query.trim(), offset, language)
      .then((page) => {
        if (request !== latestRequest.current) return;
        setGifs((current) => [...current, ...page.gifs]);
        nextOffset.current = page.nextOffset;
      })
      .catch(() => {
        // Scrolling again retries.
        if (request === latestRequest.current) nextOffset.current = offset;
      });
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.searchField}>
              <Icon name="magnifying-glass" size={18} color={colors.smoke} />
              <TextInput
                style={styles.searchInput}
                placeholder={t('gif.searchPlaceholder')}
                placeholderTextColor={colors.smoke}
                value={query}
                onChangeText={setQuery}
                returnKeyType="search"
                autoCorrect={false}
                accessibilityLabel={t('gif.searchPlaceholder')}
              />
            </View>
            <Touchable
              onPress={onClose}
              style={styles.closeButton}
              iconButton
              accessibilityRole="button"
              accessibilityLabel={t('gif.close')}
            >
              <Icon name="xmark" size={20} color={colors.char} />
            </Touchable>
          </View>
          {/* Above the grid rather than under it, where the keyboard would
              cover it: GIPHY requires the mark to be conspicuous. */}
          <Text style={styles.attribution}>{t('gif.poweredBy')}</Text>

          {status === 'loading' ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.ember} />
            </View>
          ) : status === 'error' ? (
            <View style={styles.centered}>
              <Text style={styles.message}>{t('gif.loadFailed')}</Text>
              <Touchable
                onPress={() => loadFirstPage(query.trim())}
                style={styles.retryButton}
                accessibilityRole="button"
              >
                <Text style={styles.retryText}>{t('gif.retry')}</Text>
              </Touchable>
            </View>
          ) : gifs.length === 0 ? (
            <View style={styles.centered}>
              <Text style={styles.message}>{t('gif.empty')}</Text>
            </View>
          ) : (
            <FlatList
              key={columns}
              data={gifs}
              numColumns={columns}
              // GIPHY's pages can repeat an entry, and the rules forbid
              // filtering results, so the id alone isn't a unique key.
              keyExtractor={(gif, index) => `${gif.id}-${index}`}
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + spacing.md }]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              onEndReached={onEndReached}
              onEndReachedThreshold={0.6}
              renderItem={({ item }) => (
                <Touchable
                  onPress={() => onPick(item)}
                  accessibilityRole="button"
                  accessibilityLabel={item.title || t('conversations.gifPreview')}
                >
                  <FastImage
                    source={{ uri: item.previewUrl }}
                    style={[styles.cell, { width: cellSize, height: cellSize }]}
                    resizeMode={FastImage.resizeMode.cover}
                  />
                </Touchable>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, alignItems: 'center', backgroundColor: colors.paper },
    content: { flex: 1, width: '100%', maxWidth: MAX_CONTENT_WIDTH },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    searchField: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 46,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: colors.fill,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 10,
      fontFamily: fonts.family,
      fontSize: fontSizes.body,
      color: colors.ink,
    },
    closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    attribution: {
      fontFamily: fonts.family,
      fontSize: fontSizes.caption,
      fontWeight: '600',
      color: colors.smoke,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    grid: { paddingHorizontal: spacing.md, gap: GRID_GAP },
    gridRow: { gap: GRID_GAP },
    cell: { borderRadius: radii.sm, backgroundColor: colors.fill },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      padding: spacing.xl,
    },
    message: {
      fontFamily: fonts.family,
      fontSize: fontSizes.body,
      color: colors.smoke,
      textAlign: 'center',
    },
    retryButton: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
      borderRadius: radii.pill,
      backgroundColor: colors.ember,
    },
    retryText: {
      fontFamily: fonts.family,
      fontSize: fontSizes.body,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
