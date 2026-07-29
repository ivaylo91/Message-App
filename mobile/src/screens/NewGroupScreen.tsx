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

type Props = NativeStackScreenProps<AppStackParamList, 'NewGroup'>;

const SEARCH_DEBOUNCE_MS = 300;
const MIN_GROUP_MEMBERS = 2;

export function NewGroupScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { userId } = useAuth();
  const insets = useSafeAreaInsets();
  const { contentWidth } = useContentWidth();
  const [groupName, setGroupName] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selected, setSelected] = useState<Profile[]>([]);
  const [isCreating, setIsCreating] = useState(false);
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

  const toggleSelected = (profile: Profile) => {
    setSelected((current) =>
      current.some((p) => p.id === profile.id)
        ? current.filter((p) => p.id !== profile.id)
        : [...current, profile],
    );
  };

  const canCreate = groupName.trim().length > 0 && selected.length >= MIN_GROUP_MEMBERS;

  const onCreate = async () => {
    if (!canCreate || !userId) return;
    setIsCreating(true);
    try {
      const conversation = await conversationsData.createConversation(
        selected.map((p) => p.id),
        groupName.trim(),
      );
      navigation.replace('Chat', {
        conversationId: conversation.id,
        title: groupName.trim(),
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.lg }]}>
      <View style={[styles.content, { maxWidth: contentWidth }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
            <Text style={styles.cancelText}>{t('newChat.cancel')}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('newGroup.title')}</Text>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => void onCreate()}
            disabled={!canCreate || isCreating}
          >
            {isCreating ? (
              <ActivityIndicator size="small" color={colors.ember} />
            ) : (
              <Text style={[styles.createText, !canCreate && styles.createTextDisabled]}>
                {t('newGroup.create')}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.nameField}>
          <TextInput
            style={styles.nameInput}
            placeholder={t('newGroup.namePlaceholder')}
            placeholderTextColor={colors.smoke}
            value={groupName}
            onChangeText={setGroupName}
          />
        </View>

        {selected.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsRow}
            contentContainerStyle={styles.chipsContent}
          >
            {selected.map((profile) => (
              <TouchableOpacity
                key={profile.id}
                style={styles.chip}
                onPress={() => toggleSelected(profile)}
              >
                <Avatar name={profile.display_name || profile.email} size={40} />
                <Text style={styles.chipName} numberOfLines={1}>
                  {profile.display_name}
                </Text>
                <Text style={styles.chipRemove}>✕</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder={t('newChat.searchPlaceholder')}
            placeholderTextColor={colors.smoke}
            autoCapitalize="none"
            value={query}
            onChangeText={onChangeQuery}
          />
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}
        >
          {isSearching && <ActivityIndicator color={colors.ember} style={styles.spinner} />}
          {!isSearching && query.trim() && results.length === 0 && (
            <Text style={styles.emptyText}>{t('newChat.noResults')}</Text>
          )}
          {!query.trim() && results.length === 0 && (
            <Text style={styles.emptyText}>{t('newGroup.emptyPrompt')}</Text>
          )}

          {results.map((profile) => {
            const isSelected = selected.some((p) => p.id === profile.id);
            return (
              <TouchableOpacity
                key={profile.id}
                style={styles.row}
                onPress={() => toggleSelected(profile)}
              >
                <Avatar name={profile.display_name || profile.email} />
                <View style={styles.rowMain}>
                  <Text style={styles.rowName}>{profile.display_name}</Text>
                  <Text style={styles.rowSub}>{profile.email}</Text>
                </View>
                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                  {isSelected && <Text style={styles.checkboxMark}>✓</Text>}
                </View>
              </TouchableOpacity>
            );
          })}
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
    flexDirection: 'row',
  },
  cancelButton: { position: 'absolute', left: spacing.lg, top: 0 },
  cancelText: { color: colors.ember, fontSize: 15, fontWeight: '600' },
  title: { fontSize: 17, fontWeight: '700', color: colors.ink },
  createButton: { position: 'absolute', right: spacing.lg, top: 0 },
  createText: { color: colors.ember, fontSize: 15, fontWeight: '700' },
  createTextDisabled: { color: colors.smoke },
  nameField: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  nameInput: {
    backgroundColor: colors.paper2,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '600',
    color: colors.ink,
  },
  chipsRow: { flexGrow: 0, marginBottom: spacing.md },
  chipsContent: { paddingHorizontal: spacing.lg, gap: spacing.md },
  chip: { alignItems: 'center', width: 56 },
  chipName: { fontSize: 11, color: colors.ink, marginTop: 4, width: 56, textAlign: 'center' },
  chipRemove: {
    position: 'absolute',
    top: -2,
    right: -2,
    fontSize: 10,
    color: colors.white,
    backgroundColor: colors.smoke,
    width: 16,
    height: 16,
    borderRadius: 8,
    textAlign: 'center',
    lineHeight: 16,
    overflow: 'hidden',
  },
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
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: colors.ember, borderColor: colors.ember },
  checkboxMark: { color: colors.white, fontSize: 13, fontWeight: '700' },
});