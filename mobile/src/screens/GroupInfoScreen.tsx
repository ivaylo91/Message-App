import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { FontAwesome6 } from '@react-native-vector-icons/fontawesome6/static';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../auth/AuthContext';
import * as conversationsData from '../data/conversations';
import * as profilesData from '../data/profiles';
import { Avatar } from '../components/Avatar';
import { Touchable } from '../components/Touchable';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmSheet';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { useContentWidth } from '../hooks/useContentWidth';
import { fontSizes, radii, spacing, ThemeColors } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';
import { ConversationParticipant, ProfileSearchResult } from '../types';

type Props = NativeStackScreenProps<AppStackParamList, 'GroupInfo'>;

const SEARCH_DEBOUNCE_MS = 300;
const MAX_GROUP_NAME_LENGTH = 60;

// Everything a group could not do before: see who is in it, rename it,
// add people, remove people, and leave. Permissions mirror the RPCs
// exactly (see 20260910_add_group_management.sql) - admin-only for
// rename/add/remove-someone-else, anyone may leave - and the UI simply
// doesn't offer what the server would refuse.
export function GroupInfoScreen({ route, navigation }: Props) {
  const { conversationId } = route.params;
  const { t } = useTranslation();
  const { userId } = useAuth();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const insets = useSafeAreaInsets();
  const { contentWidth } = useContentWidth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [participants, setParticipants] = useState<ConversationParticipant[]>([]);
  const [groupName, setGroupName] = useState('');
  const [savedName, setSavedName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const conversation = await conversationsData.fetchConversation(conversationId);
      setParticipants(conversation.conversation_participants);
      setSavedName(conversation.name ?? '');
      setGroupName(conversation.name ?? '');
    } catch {
      showToast(t('groupInfo.loadFailedToast'));
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, showToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const isAdmin = useMemo(
    () => participants.some((p) => p.user_id === userId && p.role === 'ADMIN'),
    [participants, userId],
  );

  const memberIds = useMemo(
    () => new Set(participants.map((p) => p.user_id)),
    [participants],
  );

  const onChangeQuery = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim()) {
      setResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    debounceRef.current = setTimeout(() => {
      profilesData
        .searchProfiles(text)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setIsSearching(false));
    }, SEARCH_DEBOUNCE_MS);
  };

  const onSaveName = async () => {
    const trimmed = groupName.trim();
    if (!trimmed || trimmed === savedName || isSavingName) return;
    setIsSavingName(true);
    try {
      await conversationsData.renameConversation(conversationId, trimmed);
      setSavedName(trimmed);
      showToast(t('groupInfo.renamedToast'));
    } catch {
      // Put the field back to what the group is actually called, rather
      // than leaving a name on screen that was never saved.
      setGroupName(savedName);
      Alert.alert(t('groupInfo.renameFailedTitle'), t('groupInfo.renameFailedMessage'));
    } finally {
      setIsSavingName(false);
    }
  };

  const onAdd = async (profile: ProfileSearchResult) => {
    if (isAdding) return;
    setIsAdding(true);
    try {
      await conversationsData.addConversationParticipants(conversationId, [profile.id]);
      setQuery('');
      setResults([]);
      await load();
      showToast(t('groupInfo.addedToast', { name: profile.display_name }));
    } catch {
      Alert.alert(t('groupInfo.addFailedTitle'), t('groupInfo.addFailedMessage'));
    } finally {
      setIsAdding(false);
    }
  };

  const onRemove = (participant: ConversationParticipant) => {
    const name = participant.profiles.display_name || participant.profiles.email;
    void confirm({
      title: t('groupInfo.removeConfirmTitle'),
      message: t('groupInfo.removeConfirmMessage', { name }),
      cancelLabel: t('chat.cancel'),
      options: [{ id: 'remove', label: t('groupInfo.remove'), destructive: true }],
    }).then((choice) => {
      if (choice !== 'remove') return;
      void conversationsData
        .removeConversationParticipant(conversationId, participant.user_id)
        .then(load)
        .catch(() =>
          Alert.alert(t('groupInfo.removeFailedTitle'), t('groupInfo.removeFailedMessage')),
        );
    });
  };

  const onLeave = () => {
    if (!userId) return;
    void confirm({
      title: t('groupInfo.leaveConfirmTitle'),
      message: t('groupInfo.leaveConfirmMessage'),
      cancelLabel: t('chat.cancel'),
      options: [{ id: 'leave', label: t('groupInfo.leave'), destructive: true }],
    }).then((choice) => {
      if (choice !== 'leave') return;
      void conversationsData
        .removeConversationParticipant(conversationId, userId)
        // Back past the chat itself - staying in a conversation you just
        // left would only show an empty, unusable screen.
        .then(() => navigation.navigate('Conversations'))
        .catch(() =>
          Alert.alert(t('groupInfo.leaveFailedTitle'), t('groupInfo.leaveFailedMessage')),
        );
    });
  };

  const addableResults = results.filter((profile) => !memberIds.has(profile.id));

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      <View style={[styles.content, { maxWidth: contentWidth }]}>
        <View style={styles.header}>
          <Touchable
            style={styles.backButton}
            iconButton
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel={t('chat.a11yBack')}
          >
            <FontAwesome6 name="chevron-left" iconStyle="solid" size={18} color={colors.ink} />
          </Touchable>
          <Text style={styles.headerTitle}>{t('groupInfo.title')}</Text>
        </View>

        {isLoading ? (
          <SkeletonGroup style={styles.listContent}>
            {Array.from({ length: 5 }).map((_, i) => (
              <View key={i} style={styles.skeletonMemberRow}>
                <Skeleton width={38} height={38} radius={19} />
                <View style={styles.skeletonMemberText}>
                  <Skeleton width="50%" height={13} />
                  <Skeleton width="28%" height={11} />
                </View>
              </View>
            ))}
          </SkeletonGroup>
        ) : (
          <FlatList
            data={participants}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <View>
                <Text style={styles.label}>{t('groupInfo.nameLabel')}</Text>
                <View style={styles.nameRow}>
                  <TextInput
                    style={styles.nameInput}
                    value={groupName}
                    onChangeText={setGroupName}
                    editable={isAdmin && !isSavingName}
                    maxLength={MAX_GROUP_NAME_LENGTH}
                    placeholder={t('groupInfo.namePlaceholder')}
                    placeholderTextColor={colors.smoke}
                  />
                  {isAdmin && groupName.trim() !== savedName && groupName.trim().length > 0 && (
                    <Touchable
                      style={styles.saveButton}
                      onPress={() => void onSaveName()}
                      disabled={isSavingName}
                      accessibilityRole="button"
                      accessibilityLabel={t('groupInfo.save')}
                    >
                      {isSavingName ? (
                        <ActivityIndicator size="small" color={colors.white} />
                      ) : (
                        <Text style={styles.saveButtonText}>{t('groupInfo.save')}</Text>
                      )}
                    </Touchable>
                  )}
                </View>
                {!isAdmin && <Text style={styles.hint}>{t('groupInfo.adminOnlyHint')}</Text>}

                {isAdmin && (
                  <>
                    <Text style={styles.label}>{t('groupInfo.addPeopleLabel')}</Text>
                    <View style={styles.searchBar}>
                      <FontAwesome6
                        name="magnifying-glass"
                        iconStyle="solid"
                        size={13}
                        color={colors.smoke}
                      />
                      <TextInput
                        style={styles.searchInput}
                        value={query}
                        onChangeText={onChangeQuery}
                        autoCapitalize="none"
                        placeholder={t('groupInfo.addPeoplePlaceholder')}
                        placeholderTextColor={colors.smoke}
                      />
                      {isSearching && <ActivityIndicator size="small" color={colors.smoke} />}
                    </View>
                    {addableResults.map((profile) => (
                      <Touchable
                        key={profile.id}
                        style={styles.resultRow}
                        onPress={() => void onAdd(profile)}
                        disabled={isAdding}
                        accessibilityRole="button"
                      >
                        <Avatar
                          name={profile.display_name}
                          avatarPath={profile.avatar_path}
                          size={32}
                        />
                        <Text style={styles.resultName} numberOfLines={1}>
                          {profile.display_name}
                        </Text>
                        <FontAwesome6
                          name="plus"
                          iconStyle="solid"
                          size={14}
                          color={colors.ember}
                        />
                      </Touchable>
                    ))}
                  </>
                )}

                <Text style={styles.label}>
                  {t('groupInfo.membersLabel', { count: participants.length })}
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const name = item.profiles.display_name || item.profiles.email;
              const isSelf = item.user_id === userId;
              return (
                <View style={styles.memberRow}>
                  <Avatar name={name} avatarPath={item.profiles.avatar_path} size={38} />
                  <View style={styles.memberText}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {isSelf ? t('groupInfo.you', { name }) : name}
                    </Text>
                    {item.role === 'ADMIN' && (
                      <Text style={styles.memberRole}>{t('groupInfo.admin')}</Text>
                    )}
                  </View>
                  {isAdmin && !isSelf && (
                    <Touchable
                      onPress={() => onRemove(item)}
                      accessibilityRole="button"
                      accessibilityLabel={t('groupInfo.removeLabel', { name })}
                    >
                      <FontAwesome6
                        name="user-minus"
                        iconStyle="solid"
                        size={15}
                        color={colors.danger}
                      />
                    </Touchable>
                  )}
                </View>
              );
            }}
            ListFooterComponent={
              <Touchable
                style={styles.leaveButton}
                onPress={onLeave}
                accessibilityRole="button"
              >
                <FontAwesome6
                  name="right-from-bracket"
                  iconStyle="solid"
                  size={15}
                  color={colors.danger}
                />
                <Text style={styles.leaveText}>{t('groupInfo.leave')}</Text>
              </Touchable>
            }
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
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
    },
    backButton: { width: 30, alignItems: 'flex-start' },
    headerTitle: { fontSize: fontSizes.title, fontWeight: '800', color: colors.ink },
    spinner: { marginTop: spacing.xxl },
    listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
    label: {
      fontSize: fontSizes.caption,
      fontWeight: '700',
      color: colors.smoke,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginTop: spacing.lg,
      marginBottom: 6,
    },
    hint: { fontSize: fontSizes.caption, color: colors.smoke, marginTop: 4 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    nameInput: {
      flex: 1,
      backgroundColor: colors.paper2,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      fontSize: fontSizes.body,
      color: colors.ink,
    },
    saveButton: {
      paddingHorizontal: spacing.lg,
      paddingVertical: 11,
      borderRadius: radii.pill,
      backgroundColor: colors.ember,
    },
    saveButtonText: { color: colors.white, fontWeight: '700', fontSize: fontSizes.footnote },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: 12,
      backgroundColor: colors.paper2,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
    },
    searchInput: { flex: 1, paddingVertical: 9, fontSize: fontSizes.body, color: colors.ink },
    resultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: 10,
    },
    resultName: { flex: 1, fontSize: fontSizes.body, color: colors.ink },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
    },
    memberText: { flex: 1, minWidth: 0 },
    skeletonMemberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: 12,
    },
    skeletonMemberText: { flex: 1, gap: 7 },
    memberName: { fontSize: fontSizes.body, color: colors.ink, fontWeight: '600' },
    memberRole: { fontSize: fontSizes.caption, color: colors.smoke, marginTop: 1 },
    leaveButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      marginTop: spacing.xl,
      paddingVertical: 12,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.line,
    },
    leaveText: { color: colors.danger, fontWeight: '700', fontSize: fontSizes.body },
  });
