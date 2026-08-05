import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import FastImage from '@d11/react-native-fast-image';
import { FontAwesome6 } from '@react-native-vector-icons/fontawesome6/static';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../navigation/RootNavigator';
import * as conversationsData from '../data/conversations';
import type { MediaMessage } from '../data/conversations';
import * as mediaData from '../data/media';
import { AppWallpaper } from '../components/AppWallpaper';
import { useContentWidth } from '../hooks/useContentWidth';
import { radii, spacing, ThemeColors } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';
import { fileIconName, formatDuration } from '../utils/messagePreview';

type Props = NativeStackScreenProps<AppStackParamList, 'MediaGallery'>;
type Tab = 'photos' | 'files';

const GRID_COLUMNS = 3;
const GRID_GAP = 2;

function PhotoThumbnail({ path, size }: { path: string; size: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void mediaData.getMediaSignedUrl(path).then((signedUrl) => {
      if (!cancelled) setUrl(signedUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <TouchableOpacity
      style={[styles.thumbnail, { width: size, height: size }]}
      onPress={() => url && void Linking.openURL(url)}
      disabled={!url}
    >
      {url ? (
        <FastImage
          source={{ uri: url }}
          style={styles.thumbnailImage}
          resizeMode={FastImage.resizeMode.cover}
        />
      ) : (
        <View style={[styles.thumbnailImage, styles.thumbnailLoading]}>
          <ActivityIndicator size="small" />
        </View>
      )}
    </TouchableOpacity>
  );
}

function FileRow({ item }: { item: MediaMessage }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const onOpen = async () => {
    const url = await mediaData.getMediaSignedUrl(item.media_path);
    void Linking.openURL(url);
  };

  const name =
    item.attachment_name ||
    (item.attachment_type === 'audio' ? t('mediaGallery.voiceMessage') : t('chat.file'));
  const subtitle =
    item.attachment_type === 'audio'
      ? formatDuration(Math.round((item.attachment_duration_ms ?? 0) / 1000))
      : null;

  return (
    <TouchableOpacity style={styles.fileRow} onPress={() => void onOpen()}>
      <View style={styles.fileIconCircle}>
        <FontAwesome6
          name={fileIconName(item.attachment_mime_type)}
          iconStyle="solid"
          size={16}
          color={colors.ember}
        />
      </View>
      <View style={styles.fileTextBlock}>
        <Text style={styles.fileName} numberOfLines={1}>
          {name}
        </Text>
        {subtitle && <Text style={styles.fileSubtitle}>{subtitle}</Text>}
      </View>
    </TouchableOpacity>
  );
}

export function MediaGalleryScreen({ route, navigation }: Props) {
  const { conversationId, title } = route.params;
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { contentWidth } = useContentWidth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [tab, setTab] = useState<Tab>('photos');
  const [items, setItems] = useState<MediaMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadInitial = useCallback((activeTab: Tab) => {
    setIsLoading(true);
    setHasMore(true);
    void conversationsData
      .fetchMediaMessages(conversationId, activeTab)
      .then((data) => {
        setItems(data);
        setHasMore(data.length > 0);
      })
      .finally(() => setIsLoading(false));
  }, [conversationId]);

  useEffect(() => {
    loadInitial(tab);
  }, [tab, loadInitial]);

  const onLoadMore = () => {
    if (isLoading || isLoadingMore || !hasMore || items.length === 0) return;
    setIsLoadingMore(true);
    const cursor = items[items.length - 1].created_at;
    void conversationsData
      .fetchMediaMessages(conversationId, tab, cursor)
      .then((data) => {
        setItems((current) => [...current, ...data]);
        setHasMore(data.length > 0);
      })
      .finally(() => setIsLoadingMore(false));
  };

  const thumbnailSize =
    (contentWidth - spacing.lg * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

  return (
    <View style={styles.container}>
      <AppWallpaper />
      <View style={[styles.content, { maxWidth: contentWidth }]}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <FontAwesome6 name="chevron-left" iconStyle="solid" size={18} color={colors.ink} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.backButton} />
        </View>

        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabButton, tab === 'photos' && styles.tabButtonActive]}
            onPress={() => setTab('photos')}
          >
            <Text style={[styles.tabText, tab === 'photos' && styles.tabTextActive]}>
              {t('mediaGallery.photosTab')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, tab === 'files' && styles.tabButtonActive]}
            onPress={() => setTab('files')}
          >
            <Text style={[styles.tabText, tab === 'files' && styles.tabTextActive]}>
              {t('mediaGallery.filesTab')}
            </Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <ActivityIndicator style={styles.spinner} color={colors.ember} />
        ) : items.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              {tab === 'photos' ? t('mediaGallery.noPhotos') : t('mediaGallery.noFiles')}
            </Text>
          </View>
        ) : tab === 'photos' ? (
          <FlatList
            data={items}
            numColumns={GRID_COLUMNS}
            keyExtractor={(item) => item.id}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={styles.gridContent}
            renderItem={({ item }) => (
              <PhotoThumbnail path={item.media_path} size={thumbnailSize} />
            )}
            onEndReached={onLoadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={isLoadingMore ? <ActivityIndicator style={styles.spinner} /> : null}
          />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.filesContent}
            renderItem={({ item }) => <FileRow item={item} />}
            onEndReached={onLoadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={isLoadingMore ? <ActivityIndicator style={styles.spinner} /> : null}
          />
        )}
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    content: { flex: 1, width: '100%', alignSelf: 'center' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
      gap: spacing.sm,
    },
    backButton: { width: 30, alignItems: 'flex-start' },
    headerTitle: {
      flex: 1,
      fontSize: 17,
      fontWeight: '700',
      color: colors.ink,
      textAlign: 'center',
    },
    tabRow: {
      flexDirection: 'row',
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      backgroundColor: colors.paper2,
      borderRadius: radii.pill,
      padding: 3,
    },
    tabButton: {
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
      borderRadius: radii.pill,
    },
    tabButtonActive: { backgroundColor: colors.ember },
    tabText: { fontSize: 13.5, fontWeight: '600', color: colors.smoke },
    tabTextActive: { color: colors.white },
    gridContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
    gridRow: { gap: GRID_GAP, marginBottom: GRID_GAP },
    thumbnail: { borderRadius: radii.sm, overflow: 'hidden', backgroundColor: colors.paper2 },
    thumbnailImage: { width: '100%', height: '100%' },
    thumbnailLoading: { alignItems: 'center', justifyContent: 'center' },
    filesContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
    fileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line,
    },
    fileIconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.paper2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fileTextBlock: { flex: 1 },
    fileName: { fontSize: 14.5, color: colors.ink, fontWeight: '600' },
    fileSubtitle: { fontSize: 12.5, color: colors.smoke, marginTop: 2 },
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyText: { fontSize: 14, color: colors.smoke },
    spinner: { marginTop: spacing.xl },
  });
