import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { ChatDailyLimitError, streamChat, type ChatMessage } from '@/lib/chatStream';
import { colors, radius } from '@/theme/colors';
import { fonts } from '@/theme/fonts';

interface UIMessage extends ChatMessage {
  id: string;
}

export default function ChatScreen() {
  const auth = useAuth();
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<UIMessage>>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!auth.loading && !auth.session) router.replace('/auth');
  }, [auth.loading, auth.session]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming || !auth.session) return;
    setError(null);

    const userMsg: UIMessage = { id: cryptoId(), role: 'user', content: text };
    const assistantMsg: UIMessage = { id: cryptoId(), role: 'assistant', content: '' };
    const nextHistory = [...messages, userMsg];
    setMessages([...nextHistory, assistantMsg]);
    setInput('');
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const stream = streamChat({
        messages: nextHistory.map(({ role, content }) => ({ role, content })),
        skill: 'general',
        accessToken: auth.session.access_token,
        signal: controller.signal,
      });
      let acc = '';
      for await (const chunk of stream) {
        acc += chunk;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: acc } : m))
        );
      }
      if (!acc) {
        setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id));
      }
    } catch (e) {
      if (e instanceof ChatDailyLimitError) {
        setError(e.message);
      } else if (e instanceof Error && e.name !== 'AbortError') {
        setError(e.message);
      }
      setMessages((prev) =>
        prev.filter((m) => m.id !== assistantMsg.id || m.content.length > 0)
      );
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, streaming, auth.session, messages]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={auth.signOut} hitSlop={8}>
              <Text style={styles.signOut}>Sign out</Text>
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Ask anything</Text>
              <Text style={styles.emptyBody}>
                Try: "What should I do about a 4-month sleep regression?"
              </Text>
            </View>
          }
          renderItem={({ item }) => <Bubble message={item} />}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.composer}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Message"
            placeholderTextColor={colors.mutedForeground}
            style={styles.input}
            multiline
            onSubmitEditing={send}
            blurOnSubmit
            returnKeyType="send"
          />
          <Pressable
            style={[
              styles.sendBtn,
              !streaming && !input.trim() && { backgroundColor: colors.border },
            ]}
            onPress={streaming ? cancel : send}
            disabled={!streaming && !input.trim()}
          >
            <Text style={styles.sendBtnText}>{streaming ? '■' : '↑'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function Bubble({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        <Text style={[styles.bubbleText, isUser && { color: '#fff' }]}>
          {message.content || '…'}
        </Text>
      </View>
    </View>
  );
}

function cryptoId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: 16, gap: 12 },
  row: { flexDirection: 'row' },
  rowUser: { justifyContent: 'flex-end' },
  rowAssistant: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  bubbleUser: { backgroundColor: colors.primary, borderColor: colors.primary },
  bubbleAssistant: { backgroundColor: colors.card, borderColor: colors.border },
  bubbleText: { fontFamily: fonts.bodyRegular, fontSize: 15, color: colors.foreground },
  empty: { padding: 16, gap: 6 },
  emptyTitle: { fontFamily: fonts.displayBold, fontSize: 22, color: colors.foreground },
  emptyBody: { fontFamily: fonts.bodyRegular, fontSize: 15, color: colors.mutedForeground },
  composer: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: fonts.bodyRegular,
    fontSize: 15,
    color: colors.foreground,
    backgroundColor: colors.background,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnText: { color: '#fff', fontSize: 22, fontWeight: '700', lineHeight: 24 },
  error: {
    color: colors.destructive,
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  signOut: {
    fontFamily: fonts.bodySemibold,
    fontSize: 14,
    color: colors.primary,
    paddingHorizontal: 12,
  },
});
