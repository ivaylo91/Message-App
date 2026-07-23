import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import * as conversationsData from '../data/conversations';
import { Message } from '../types';

type Props = NativeStackScreenProps<AppStackParamList, 'Chat'>;

export function ChatScreen({ route, navigation }: Props) {
  const { conversationId, title } = route.params;
  const { userId } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);

  const upsertMessage = useCallback((incoming: Message) => {
    setMessages((current) => {
      if (current.some((m) => m.id === incoming.id)) return current;
      return [incoming, ...current];
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void conversationsData
        .fetchMessages(conversationId)
        .then((fetched) => setMessages(fetched));
    }, [conversationId]),
  );

  useEffect(() => {
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => upsertMessage(payload.new as Message),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, upsertMessage]);

  const onSend = async () => {
    const body = draft.trim();
    if (!body || !userId) return;
    setDraft('');
    const message = await conversationsData.sendMessage(
      conversationId,
      userId,
      body,
    );
    upsertMessage(message);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <FlatList
        style={styles.list}
        data={messages}
        keyExtractor={(item) => item.id}
        inverted
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.sender_id === userId ? styles.bubbleMine : styles.bubbleTheirs,
            ]}
          >
            <Text>{item.body}</Text>
          </View>
        )}
      />
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder="Message"
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => void onSend()}
        />
        <TouchableOpacity onPress={() => void onSend()} style={styles.sendButton}>
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { flex: 1, paddingHorizontal: 12 },
  bubble: {
    padding: 10,
    borderRadius: 12,
    marginVertical: 4,
    maxWidth: '80%',
  },
  bubbleMine: { backgroundColor: '#DCF8C6', alignSelf: 'flex-end' },
  bubbleTheirs: { backgroundColor: '#F0F0F0', alignSelf: 'flex-start' },
  composer: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 8,
  },
  sendButton: { paddingHorizontal: 12, paddingVertical: 8 },
  sendText: { color: '#007AFF', fontWeight: '600' },
});
