import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../auth/AuthContext';
import * as conversationsData from '../data/conversations';
import * as profilesData from '../data/profiles';
import { Avatar } from '../components/Avatar';
import { useContentWidth } from '../hooks/useContentWidth';
import { colors, radii, spacing } from '../theme/tokens';
import { Profile } from '../types';

type Props = NativeStackScreenProps<AppStackParamList, 'NewChat'>;

const SEARCH_DEBOUNCE_MS = 300;

export function NewChatScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { userId } = useAuth();
  const insets = useSafeAreaInsets();
  const { contentWidth } = useContentWidth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(
    (text: string) => {
      if (!userId) return;
      if (!text.trim()) {
        setResults([]);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      profilesData
        .searchProfiles(text, userId)
        .then(setResults)
        .finally(() => setIsSearching(false));
    },
    [userId],
  );

  const onChangeQuery = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(text), SEARCH_DEBOUNCE_MS);
  };

  const onSelectProfile = async (profile: Profile) => {
    if (!userId) return;
    const conversation = await conversationsData.createConversation([profile.id]);
    navigation.replace('Chat', {
      conversationId: conversation.id,
      title: profile.display_name || profile.email,
    });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.lg }]}>
      <View style={[styles.content, { maxWidth: contentWidth }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
            <Text style={styles.cancelText}>{t('newChat.cancel')}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('newChat.title')}</Text>
        </View>

        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder={t('newChat.searchPlaceholder')}
            placeholderTextColor={colors.smoke}
            autoCapitalize="none"
            value={query}
            onChangeText={onChangeQuery}
            autoFocus
          />
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}
        >
          {!query.trim() && (
            <TouchableOpacity
              style={styles.row}
              onPress={() => navigation.navigate('NewGroup')}
            >
              <View style={styles.newGroupIcon}>
                <Text style={styles.newGroupIconText}>👥</Text>
              </View>
              <View style={styles.rowMain}>
                <Text style={styles.rowName}>{t('newChat.newGroup')}</Text>
              </View>
            </TouchableOpacity>
          )}

          {isSearching && <ActivityIndicator color={colors.ember} style={styles.spinner} />}

          {!isSearching && query.trim() && results.length === 0 && (
            <Text style={styles.emptyText}>{t('newChat.noResults')}</Text>
          )}
          {!query.trim() && results.length === 0 && (
            <Text style={styles.emptyText}>{t('newChat.emptyPrompt')}</Text>
          )}

          {results.map((profile) => (
            <TouchableOpacity
              key={profile.id}
              style={styles.row}
              onPress={() => void onSelectProfile(profile)}
            >
              <Avatar
                name={profile.display_name || profile.email}
                avatarPath={profile.avatar_path}
              />
              <View style={styles.rowMain}>
                <Text style={styles.rowName}>{profile.display_name}</Text>
                <Text style={styles.rowSub}>{profile.email}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, paddingTop: spacing.lg },
  content: { flex: 1, width: '100%', alignSelf: 'center' },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: { position: 'absolute', left: spacing.lg, top: 0 },
  cancelText: { color: colors.ember, fontSize: 15, fontWeight: '600' },
  title: { fontSize: 17, fontWeight: '700', color: colors.ink },
  searchBar: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.paper2,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  searchInput: { paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: colors.ink },
  spinner: { marginTop: spacing.xl },
  emptyText: {
    textAlign: 'center',
    color: colors.smoke,
    marginTop: spacing.xxl,
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  rowMain: { flex: 1 },
  rowName: { fontWeight: '700', fontSize: 15.5, color: colors.ink },
  rowSub: { fontSize: 12.5, color: colors.smoke, marginTop: 1 },
  newGroupIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.ember,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newGroupIconText: { fontSize: 20 },
});