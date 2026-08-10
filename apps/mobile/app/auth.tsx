import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Circle, G, Path, Svg } from 'react-native-svg';
import { DEFAULT_PHONE_COUNTRY, toE164, type PhoneCountry } from '@amragrir/shared';
import { auth } from '../src/api/endpoints';
import { ApiError } from '../src/api/client';
import { PhoneField } from '../src/components/PhoneField';
import { useTranslate, type Translate } from '../src/language';
import { useSession } from '../src/session';
import { useTheme } from '../src/theme/useTheme';

type Step = 'phone' | 'code';

/**
 * Sign-in — the artifact's AUTH GATE, with two departures it forces.
 *
 * - **No Apple/Google buttons.** Customer identity is phone + OTP; there is no
 *   social endpoint to call, and a button that cannot work is worse than none.
 * - **No log-in / sign-up tabs.** `verify-code` takes an optional name and
 *   upgrades the guest in place, so there is one flow, not two. The name field
 *   appears with the code step, which is the moment the account becomes real.
 *
 * The artifact also has no OTP step at all (SCREENS.md §0 records that it should
 * grow one). This screen keeps its two steps, because that is what the API does.
 *
 * The artifact's third departure, and the newest: **the `+374` it prints beside
 * the field is a country picker.** It was a constant here, so a diaspora or a
 * visiting customer — the people this product's own country list was built for —
 * could not sign in from the phone at all. See `src/components/PhoneField.tsx`.
 */
export default function AuthScreen() {
  const { colors } = useTheme();
  const t = useTranslate();
  const router = useRouter();
  const { signIn } = useSession();

  const [step, setStep] = useState<Step>('phone');
  const [country, setCountry] = useState<PhoneCountry>(DEFAULT_PHONE_COUNTRY);
  const [national, setNational] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The number as the API takes it, or null while it is unfinished.
   *
   * Null is what disables Continue: a number that is short for its country is
   * refused by `normalizePhone` anyway, and hearing that as a banner after a
   * round trip is worse than not being able to press the button. `PhoneField`
   * says *why* in the field itself.
   */
  const phone = toE164(country, national);
  const ready = step === 'phone' ? phone !== null : code.length >= 4;

  async function submitPhone() {
    if (phone === null) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await auth.sendCode(phone);
      setStep('code');
    } catch (err) {
      setError(describe(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    if (phone === null) {
      // Unreachable: the code step is only entered once a whole number sent
      // one. Here so the number goes to `verify-code` exactly as it went to
      // `send-code` — the two must agree, or the OTP is looked up under a key
      // that was never written.
      setStep('phone');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // The stored guest bearer rides along, so the server upgrades that
      // account rather than creating a second one.
      const result = await auth.verifyCode(phone, code, name.trim() || undefined);
      signIn(result.user, result.accessToken);
      router.replace('/');
    } catch (err) {
      setError(describe(err, t));
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = [
    styles.input,
    { color: colors.ink, backgroundColor: colors.card, borderColor: colors.line },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* The artifact paints this 150° accent→accent2 gradient. Rendered as
              a flat accent, as elsewhere in this app: a gradient would need a
              native module for one decorative panel. */}
          <View style={[styles.hero, { backgroundColor: colors.accent }]}>
            <View style={styles.brandRow}>
              <Brand accent={colors.accent} />
              <Text style={styles.wordmark}>amragrir.am</Text>
            </View>
            <Text style={styles.tagline}>{t('authTagline')}</Text>
          </View>

          <View style={styles.body}>
            <Text style={[styles.title, { color: colors.ink }]}>
              {step === 'phone' ? t('signIn') : t('codeLabel')}
            </Text>
            <Text style={[styles.hint, { color: colors.ink2 }]}>
              {step === 'phone' ? t('authOtpNote') : `${t('codeHint')} ${phone ?? ''}`}
            </Text>

            {step === 'phone' ? (
              <PhoneField
                country={country}
                national={national}
                onChangeCountry={setCountry}
                onChangeNational={setNational}
                autoFocus
              />
            ) : (
              <>
                <TextInput
                  value={code}
                  onChangeText={(next) => setCode(next.replace(/\D/g, ''))}
                  placeholder="1234"
                  placeholderTextColor={colors.ink3}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                  style={[...inputStyle, styles.code]}
                />
                <Text style={[styles.label, { color: colors.ink2 }]}>{t('authName')}</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder={t('authNamePlaceholder')}
                  placeholderTextColor={colors.ink3}
                  style={inputStyle}
                />
              </>
            )}

            {error !== null ? (
              <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
            ) : null}

            <Pressable
              onPress={step === 'phone' ? submitPhone : submitCode}
              disabled={busy || !ready}
              style={({ pressed }) => [
                styles.button,
                {
                  backgroundColor: colors.accent,
                  opacity: busy || !ready ? 0.5 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                },
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>
                  {step === 'phone' ? t('authContinue') : t('verifyCode')}
                </Text>
              )}
            </Pressable>

            {step === 'code' ? (
              <Pressable onPress={() => setStep('phone')} style={styles.link}>
                <Text style={[styles.linkText, { color: colors.ink2 }]}>{t('changeNumber')}</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => router.back()} style={styles.link}>
                <Text style={[styles.linkText, { color: colors.ink2 }]}>{t('authGuest')}</Text>
              </Pressable>
            )}

            <Text style={[styles.terms, { color: colors.ink3 }]}>{t('authTerms')}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** The pin with a fork, a knife and a clock badge — the product in one glyph:
 *  this is order-ahead, not delivery. Inverted here (white pin, accent marks)
 *  because it sits on the accent panel. */
function Brand({ accent }: { accent: string }) {
  return (
    <Svg width={38} height={38} viewBox="0 0 76 76" fill="none">
      <Path
        d="M36 6c-13 0-23 9.6-23 23 0 15.5 23 41 23 41s23-25.5 23-41C59 15.6 49 6 36 6Z"
        fill="#fff"
      />
      <G stroke={accent} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <Path d="M25 16v8M30 16v9M35 16v8" strokeWidth={2.8} />
        <Path d="M25 24c0 3.4 2.2 5 5 5s5-1.6 5-5" strokeWidth={2.8} />
        <Path d="M30 29v21" strokeWidth={3.6} />
        <Path d="M46 50V34" strokeWidth={3.6} />
      </G>
      <Path d="M46 16c-3.4 0-5.2 3.4-5.2 7.6s1.8 6.4 5.2 6.4V16Z" fill={accent} />
      <Circle cx={58} cy={20} r={11} fill={accent} stroke="#fff" strokeWidth={3} />
      <Path
        d="M58 15v5l3.4 2.2"
        stroke="#fff"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** The API's error envelope already carries a human-readable message, localised
 *  by the `Accept-Language` the client now always sends. */
function describe(err: unknown, t: Translate): string {
  return err instanceof ApiError ? err.message : t('somethingWentWrong');
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flexGrow: 1 },
  hero: { height: 230, justifyContent: 'flex-end', paddingHorizontal: 24, paddingBottom: 26 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wordmark: { color: '#fff', fontWeight: '800', fontSize: 18, letterSpacing: -0.3 },
  tagline: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 12,
    maxWidth: 260,
    lineHeight: 29,
  },
  body: { padding: 24, gap: 12 },
  title: { fontSize: 27, fontWeight: '800', letterSpacing: -0.6 },
  hint: { fontSize: 13.5, lineHeight: 19, marginBottom: 6 },
  label: { fontSize: 12.5, fontWeight: '700', marginTop: 6 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 52,
    fontSize: 15.5,
  },
  code: { letterSpacing: 8, textAlign: 'center', fontSize: 22, fontWeight: '700' },
  button: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  link: { alignItems: 'center', paddingVertical: 12 },
  linkText: { fontSize: 13.5, fontWeight: '700' },
  terms: { fontSize: 11.5, textAlign: 'center', lineHeight: 17, marginTop: 6 },
  error: { fontSize: 13.5, fontWeight: '600' },
});
