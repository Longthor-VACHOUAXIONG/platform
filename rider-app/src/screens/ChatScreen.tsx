import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, typography } from '../theme/theme';
import { listenToMessages, sendMessage, type ChatMessage } from '../api/rideApi';
import { auth } from '../api/firebaseConfig';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

export default function ChatScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { rideId, otherPartyName } = route.params;
  const [messages, setMessages] = useState<(ChatMessage & { id: string })[]>([]);
  const [text, setText] = useState('');
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    const unsub = listenToMessages(rideId, setMessages);
    return unsub;
  }, [rideId]);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      await sendMessage(rideId, trimmed);
      setText('');
    } catch (err) {
      // Keep the typed text in the input so the rider can retry.
      console.warn('Failed to send chat message', err);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={colors.black} />
        </Pressable>
        <Text style={typography.h3}>{otherPartyName}</Text>
        <View style={{ width: 22 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.xs }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            const isMine = item.senderId === auth.currentUser?.uid;
            return (
              <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                <Text style={isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs}>{item.text}</Text>
              </View>
            );
          }}
        />

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={t('chat.messagePlaceholder')}
            placeholderTextColor={colors.gray400}
            onSubmitEditing={send}
            returnKeyType="send"
          />
          <Pressable style={styles.sendButton} onPress={send}>
            <Ionicons name="send" size={18} color={colors.white} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
  },
  bubble: { maxWidth: '80%', borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  bubbleMine: { backgroundColor: colors.primary, alignSelf: 'flex-end' },
  bubbleTheirs: { backgroundColor: colors.gray100, alignSelf: 'flex-start' },
  bubbleTextMine: { ...typography.body, color: colors.white },
  bubbleTextTheirs: { ...typography.body, color: colors.black },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.gray100,
  },
  input: { flex: 1, backgroundColor: colors.gray100, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 10 },
  sendButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
