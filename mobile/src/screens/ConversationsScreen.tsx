import React, { useCallback, useState } from 'react';
import {
  Button,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../auth/AuthContext';
import * as conversationsData from '../data/conversations';
import { setLanguage, SUPPORTED_LANGUAGES, SupportedLanguage } from '../i18n';
import { Conversation, Message } from '../types';

type Props = NativeStackScreenProps<AppStackParamList, 'Conversations'>;

export function ConversationsScreen({ navigation }: Props) {
  const { t, i18n } = useTranslation();
  const { userId, logout } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [newParticipantId, setNewParticipantId] = useState('');

  function previewText(message: Message | undefined): string {
    if (!message) return t('conversations.noMessagesYet');
    if (message.media_path) return t('conversations.photoPreview');
    return message.body ?? t('conversations.noMessagesYet');
  }

  const load = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const data = await conversationsData.fetchConversations();
      setConversations(data);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const startConversation = async () => {
    if (!newParticipantId.trim()) return;
    const conversation = await conversationsData.createConversation([
      newParticipantId.trim(),
    ]);
    setNewParticipantId('');
    navigation.navigate('Chat', {
      conversationId: conversation.id,
      title: conversationTitle(conversation),
    });
  };

  const conversationTitle = (conversation: Conversation) => {
    if (conversation.is_group)
      return conversation.name ?? t('conversations.groupChat');
    const other = conversation.conversation_participants.find(
      (p) => p.user_id !== userId,
    );
    return (
      other?.profiles.display_name ??
      other?.profiles.email ??
      t('conversations.directMessage')
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.languageRow}>
        {SUPPORTED_LANGUAGES.map((lang: SupportedLanguage) => (
          <TouchableOpacity
            key={lang}
            style={[
              styles.languageChip,
              i18n.language === lang && styles.languageChipActive,
            ]}
            onPress={() => void setLanguage(lang)}
          >
            <Text
              style={[
                styles.languageChipText,
                i18n.language === lang && styles.languageChipTextActive,
              ]}
            >
              {lang.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.newConversationRow}>
        <TextInput
          style={styles.input}
          placeholder={t('conversations.newChatPlaceholder')}
          value={newParticipantId}
          onChangeText={setNewParticipantId}
        />
        <Button title={t('conversations.go')} onPress={() => void startConversation()} />
      </View>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={load} />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() =>
              navigation.navigate('Chat', {
                conversationId: item.id,
                title: conversationTitle(item),
              })
            }
          >
            <Text style={styles.rowTitle}>{conversationTitle(item)}</Text>
            <Text style={styles.rowPreview} numberOfLines={1}>
              {previewText(item.messages?.[0])}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>{t('conversations.noConversationsYet')}</Text>
        }
      />
      <Button title={t('conversations.logout')} onPress={() => void logout()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 16 },
  languageRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  },
  languageChip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  languageChipActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  languageChipText: { fontSize: 12, fontWeight: '600', color: '#666' },
  languageChipTextActive: { color: '#fff' },
  newConversationRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
  },
  row: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowPreview: { color: '#666', marginTop: 4 },
  empty: { textAlign: 'center', marginTop: 40, color: '#999' },
});