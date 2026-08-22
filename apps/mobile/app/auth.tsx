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
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Circle, G, Path, Svg } from 'react-native-svg';
import { DEFAULT_PHONE_COUNTRY, toE164, type PhoneCountry } from '@amragrir/shared';
import { auth } from '../src/api/endpoints';
import { ApiError } from '../src/api/client';
import { adoptGuestFavorites, adoptGuestFavoriteDishes } from '../src/guest-favorites';
import { MIN_NAME, isValidName, normalizeName } from '../src/name';
import { PhoneField } from '../src/components/PhoneField';
import { useTranslate, type Translate } from '../src/language';
import { useSession } from '../src/session';
import { useTheme } from '../src/theme/useTheme';

type Step = 'phone' | 'code';

/** Which tab is up. It picks whether the name field shows — not which endpoint
 *  runs, and not what the API does with the number. See the note below. */
type Mode = 'login' | 'register';

/**
 * Sign-in — the artifact's AUTH GATE.
 *
 * **The log-in / sign-up tabs choose a field, not an endpoint** (2026-08-11).
 * There is one credential — phone + OTP — and one call behind both tabs:
 * `verify-code` takes an optional name and upgrades the guest account in place
 * whether the number is new or returning. So "sign up" is the same flow with the
 * name field showing, which is exactly what the artifact does too, where both
 * tabs run the same `submitAuth`. Nothing here can tell a returning number from
 * a new one before the code is confirmed, and it does not need to: the API
 * decides. This is the web's bargain (`apps/web/.../signin/page.tsx`) brought
 * over — the phone had neither tab, so the one screen that says "create an
 * account" said only "sign in", and the name every other client offers to take
 * at the door could not be given here at all.
 *
 * The name is asked for on **this** step, not on the code step, and on the
 * sign-up tab it is **required** (2026-08-11): a form headed "create an account"
 * that accepts an empty name field is asking a question it does not mean, and
 * the account it opens is then identified by a phone number for the rest of its
 * life, since nothing in the product can rename it afterwards. Continue stays
 * disabled until there is a name, and the field says why once it has been left.
 *
 * The requirement is this screen's, not the API's — `verify-code` takes the name
 * as optional and the web still offers sign-up without one. It is also a rule
 * about *this form*, not about the account: an existing account confirming its
 * number here keeps whatever name it already has, because the API will not
 * rename it from a sign-in (§10). The log-in tab draws no name field and is
 * unaffected.
 *
 * The one departure the artifact forces: **no Apple/Google buttons.** Customer
 * identity is phone + OTP; there is no social endpoint to call, and a button
 * that cannot work is worse than none.
 *
 * The artifact also has no OTP step at all (SCREENS.md §0 records that it should
 * grow one). This screen keeps its two steps, because that is what the API does.
 *
 * The artifact's other departure: **the `+374` it prints beside the field is a
 * country picker.** It was a constant here, so a diaspora or a visiting customer
 * — the people this product's own country list was built for — could not sign in
 * from the phone at all. See `src/components/PhoneField.tsx`.
 *
 * **`?mode=register` opens on the sign-up tab**, which is the web's own address
 * for it (`signinPath(...)&mode=register`) rather than a second convention
 * invented for the phone. It seeds the tab and nothing else: whoever arrives
 * that way can still switch, because the two tabs run the same call and picking
 * the wrong one is not a mistake worth trapping anybody in.
 */
export default function AuthScreen() {
  const { colors } = useTheme();
  const t = useTranslate();
  const router = useRouter();
  const { signIn } = useSession();
  const { mode: requestedMode } = useLocalSearchParams<{ mode?: string }>();

  const [step, setStep] = useState<Step>('phone');
  // Read once, on mount: every arrival here is a fresh push (this screen is
  // popped on the way back), and re-reading it later would drag the tab back
  // under somebody who had just switched it by hand.
  const [mode, setMode] = useState<Mode>(requestedMode === 'register' ? 'register' : 'login');
  const [country, setCountry] = useState<PhoneCountry>(DEFAULT_PHONE_COUNTRY);
  const [national, setNational] = useState('');
  const [name, setName] = useState('');
  const [nameLeft, setNameLeft] = useState(false);
  const [code, setCode] = useState('');
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
  /** What the API would be sent, and what the tab requires there to be. The
   *  rule is shared with the Settings sheet that edits the same field. */
  const given = normalizeName(name);
  const hasName = isValidName(name);
  const ready =
    step === 'phone' ? phone !== null && (mode === 'login' || hasName) : code.length >= 4;
  // Silence while they are still typing — `PhoneField`'s rule, for the same
  // reason: an empty field is not yet a mistake, it is a field nobody has
  // reached. It speaks once they leave it, and once the number is whole: at
  // that point Continue would be lit if not for this field, and a dead button
  // with nothing explaining it is the one thing worse than an early hint.
  const showNameHint = mode === 'register' && !hasName && (nameLeft || phone !== null);

  async function submitPhone() {
    if (phone === null || (mode === 'register' && !hasName)) {
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
      // account rather than creating a second one. The name goes with it only
      // from the sign-up tab — the log-in tab draws no name field, and a name
      // arriving without one would be a name nobody typed. Trimmed and capped
      // as the web sends it, so the two clients agree on what reaches the API.
      const sending = mode === 'register' ? given : '';
      const result = await auth.verifyCode(phone, code, sending || undefined);
      // The refresh token goes to the session too: it is what `Log out` on the
      // settings screen revokes, and dropping it here would leave every
      // sign-out unable to end the session anywhere but on this phone.
      signIn(result.user, result.accessToken, result.refreshToken);
      // Whatever this guest saved on the phone becomes the account's, before
      // the home screen is shown — the tabs read the favourites list on focus,
      // and handing it over afterwards would let somebody watch their own
      // hearts come back one repaint later. Awaited rather than fired and
      // forgotten, since it is one `POST /favorites` per saved restaurant and
      // usually none; swallowed rather than surfaced, because a sign-in that
      // worked must not report itself as failed over a transfer that keeps its
      // list and retries on the next one.
      // Both lists, in parallel and independently: a dish that has since left
      // the menu must not take the restaurants' handover down with it.
      await Promise.all([
        adoptGuestFavorites().catch(() => 0),
        adoptGuestFavoriteDishes().catch(() => 0),
      ]);
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
            {/* The tabs belong to the first step only. The code step is the
                second half of the act they named, not a place to change your
                mind about it — and switching tabs under a live OTP would offer
                a name field for a code that was already sent without one. */}
            {step === 'phone' ? (
              <View style={[styles.tabs, { backgroundColor: colors.chip }]}>
                <Tab
                  label={t('authLogin')}
                  selected={mode === 'login'}
                  onPress={() => setMode('login')}
                />
                <Tab
                  label={t('authRegister')}
                  selected={mode === 'register'}
                  onPress={() => setMode('register')}
                />
              </View>
            ) : (
              <Text style={[styles.title, { color: colors.ink }]}>{t('codeLabel')}</Text>
            )}

            {step === 'phone' && mode === 'register' ? (
              <View style={styles.field}>
                {/* The asterisk is on the one field that carries it, so it
                    marks a requirement rather than decorating every label. */}
                <Text style={[styles.label, { color: colors.ink2 }]}>{t('authName')} *</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  onFocus={() => setNameLeft(false)}
                  onBlur={() => setNameLeft(true)}
                  placeholder={t('authNamePlaceholder')}
                  placeholderTextColor={colors.ink3}
                  autoComplete="name"
                  textContentType="name"
                  maxLength={120}
                  accessibilityLabel={t('authName')}
                  style={[
                    ...inputStyle,
                    showNameHint ? { borderColor: colors.danger } : null,
                  ]}
                />
                {showNameHint ? (
                  <Text
                    style={[styles.fieldHint, { color: colors.danger }]}
                    accessibilityLiveRegion="polite"
                  >
                    {t('authNameRequired')}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {step === 'phone' ? (
              <>
                {/* The note sits under the field, as the artifact draws it: it
                    explains what pressing Continue will do, so it belongs
                    beside the button rather than above the thing being typed. */}
                <PhoneField
                  country={country}
                  national={national}
                  onChangeCountry={setCountry}
                  onChangeNational={setNational}
                  autoFocus
                />
                <Text style={[styles.hint, { color: colors.ink3 }]}>{t('authOtpNote')}</Text>
              </>
            ) : (
              <>
                <Text style={[styles.hint, { color: colors.ink2 }]}>
                  {t('codeHint')} {phone ?? ''}
                </Text>
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

/** One half of the log-in / sign-up pair. The selected tab is a raised card on
 *  the tinted track, exactly as the artifact draws it — colour alone would not
 *  survive a colour-blind reader, and there are only two of them to compare. */
function Tab({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.tab,
        {
          backgroundColor: selected ? colors.card : 'transparent',
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      <Text style={[styles.tabText, { color: selected ? colors.ink : colors.ink2 }]}>{label}</Text>
    </Pressable>
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
  tabs: { flexDirection: 'row', gap: 4, borderRadius: 15, padding: 4 },
  tab: { flex: 1, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 14.5, fontWeight: '700' },
  /** Matches `PhoneField`'s own label and spacing, so the two read as one form. */
  label: { fontSize: 12.5, fontWeight: '700' },
  field: { gap: 6 },
  fieldHint: { fontSize: 12.5, fontWeight: '600' },
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
