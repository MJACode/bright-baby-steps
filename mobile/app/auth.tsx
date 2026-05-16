import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { colors, radius } from '@/theme/colors';
import { fonts } from '@/theme/fonts';

type Mode = 'signIn' | 'signUp';

export default function AuthScreen() {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (auth.session) router.replace('/chat');
  }, [auth.session]);

  const submit = () => {
    if (mode === 'signIn') auth.signIn(email, password);
    else auth.signUp(email, password);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Grace Flare</Text>
          <Text style={styles.subtitle}>Confident, calm, modern parenting support.</Text>

          {auth.pendingConfirmationEmail ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Check your inbox</Text>
              <Text style={styles.cardBody}>
                We sent a confirmation link to {auth.pendingConfirmationEmail}. Click it to activate
                your account, then return here to sign in.
              </Text>
              <Pressable
                style={styles.outlineButton}
                onPress={() => auth.resendConfirmation(auth.pendingConfirmationEmail!)}
                disabled={auth.loading}
              >
                <Text style={styles.outlineButtonText}>Resend confirmation email</Text>
              </Pressable>
              <Pressable onPress={auth.clearPending}>
                <Text style={styles.linkText}>Use a different email</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.card}>
              <View style={styles.segmented}>
                {(['signIn', 'signUp'] as const).map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setMode(m)}
                    style={[styles.segment, mode === m && styles.segmentActive]}
                  >
                    <Text style={[styles.segmentText, mode === m && styles.segmentTextActive]}>
                      {m === 'signIn' ? 'Sign in' : 'Create account'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                style={styles.input}
              />

              <Text style={styles.label}>Password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry
                textContentType={mode === 'signIn' ? 'password' : 'newPassword'}
                style={styles.input}
              />

              {auth.error && <Text style={styles.error}>{auth.error}</Text>}

              <Pressable
                style={[styles.primaryButton, auth.loading && { opacity: 0.6 }]}
                onPress={submit}
                disabled={auth.loading || !email || !password}
              >
                <Text style={styles.primaryButtonText}>
                  {auth.loading ? 'Working…' : mode === 'signIn' ? 'Sign in' : 'Create account'}
                </Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 20, gap: 24 },
  title: {
    fontFamily: fonts.displayBold,
    fontSize: 32,
    color: colors.foreground,
    textAlign: 'center',
    marginTop: 32,
  },
  subtitle: {
    fontFamily: fonts.bodyRegular,
    fontSize: 16,
    color: colors.foreground,
    opacity: 0.7,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardTitle: { fontFamily: fonts.displayBold, fontSize: 22, color: colors.foreground },
  cardBody: { fontFamily: fonts.bodyRegular, fontSize: 15, color: colors.foreground, opacity: 0.8 },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.border,
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
  },
  segment: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: radius.sm },
  segmentActive: { backgroundColor: colors.card },
  segmentText: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.mutedForeground },
  segmentTextActive: { color: colors.foreground },
  label: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.mutedForeground },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    fontFamily: fonts.bodyRegular,
    fontSize: 16,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
  primaryButton: {
    minHeight: 48,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryButtonText: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#fff' },
  outlineButton: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineButtonText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.primary },
  linkText: {
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
  error: { fontFamily: fonts.bodyRegular, fontSize: 13, color: colors.destructive },
});
