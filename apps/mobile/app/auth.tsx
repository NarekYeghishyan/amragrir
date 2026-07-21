import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { auth } from '../src/api/endpoints';
import { ApiError } from '../src/api/client';
import { useSession } from '../src/session';
import { useTheme } from '../src/theme/useTheme';
import { HIT_TARGET, radius, spacing, typography } from '../src/theme/tokens';

type Step = 'phone' | 'code';

export default function AuthScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { signIn } = useSession();

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitPhone() {
    setBusy(true);
    setError(null);
    try {
      await auth.sendCode(phone);
      setStep('code');
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    setBusy(true);
    setError(null);
    try {
      // The stored guest bearer rides along, so the server upgrades that
      // account rather than creating a second one.
      const result = await auth.verifyCode(phone, code, name.trim() || undefined);
      signIn(result.user, result.accessToken);
      router.replace('/');
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Text style={[styles.title, { color: colors.ink }]}>
        {step === 'phone' ? 'Enter your phone' : 'Enter the code'}
      </Text>
      <Text style={[styles.hint, { color: colors.ink2 }]}>
        {step === 'phone'
          ? 'We will text you a 4-digit code.'
          : `Sent to ${phone}. In development the code is printed in the API log.`}
      </Text>

      {step === 'phone' ? (
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="99 123 456"
          placeholderTextColor={colors.ink3}
          keyboardType="phone-pad"
          autoFocus
          style={[styles.input, { color: colors.ink, backgroundColor: colors.card, borderColor: colors.line }]}
        />
      ) : (
        <>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="1234"
            placeholderTextColor={colors.ink3}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
            style={[styles.input, styles.code, { color: colors.ink, backgroundColor: colors.card, borderColor: colors.line }]}
          />
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your name (optional)"
            placeholderTextColor={colors.ink3}
            style={[styles.input, { color: colors.ink, backgroundColor: colors.card, borderColor: colors.line }]}
          />
        </>
      )}

      {error !== null && <Text style={[styles.error, { color: colors.accent }]}>{error}</Text>}

      <Pressable
        onPress={step === 'phone' ? submitPhone : submitCode}
        disabled={busy || (step === 'phone' ? phone.length < 6 : code.length < 4)}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: colors.accent,
            opacity: busy || (step === 'phone' ? phone.length < 6 : code.length < 4) ? 0.5 : 1,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          },
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{step === 'phone' ? 'Continue' : 'Verify'}</Text>
        )}
      </Pressable>

      {step === 'code' && (
        <Pressable onPress={() => setStep('phone')} style={styles.link}>
          <Text style={[styles.linkText, { color: colors.ink2 }]}>Change number</Text>
        </Pressable>
      )}
    </View>
  );
}

/** The API's error envelope already carries a human-readable message. */
function describe(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Something went wrong';
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: spacing.xl, gap: spacing.md },
  title: { ...typography.title, marginTop: spacing.lg },
  hint: { ...typography.body, marginBottom: spacing.sm },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: HIT_TARGET + 8,
    ...typography.body,
  },
  code: { letterSpacing: 8, textAlign: 'center', ...typography.title },
  button: {
    height: HIT_TARGET + 8,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  buttonText: { color: '#fff', ...typography.heading },
  link: { alignItems: 'center', paddingVertical: spacing.md },
  linkText: { ...typography.label },
  error: { ...typography.label },
});
