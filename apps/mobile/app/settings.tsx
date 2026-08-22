import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Path, Svg } from 'react-native-svg';
import { Language } from '@amragrir/shared';
import { ApiError } from '../src/api/client';
import { me as meApi } from '../src/api/endpoints';
import { useCart } from '../src/cart';
import { LANGUAGE_LABELS, LANGUAGES, useLanguage, useTranslate } from '../src/language';
import { isValidName, normalizeName } from '../src/name';
import { useSession } from '../src/session';
import { spot } from '../src/theme/tokens';
import { useTheme } from '../src/theme/useTheme';

/**
 * Settings — the artifact's SETTINGS screen.
 *
 * Two deliberate departures from what it draws:
 *
 * - **No "delivery addresses" row.** This product has no couriers; an order is
 *   collected or eaten in (docs/AI_CONTEXT.md, "What NOT to do"). A row asking
 *   for a delivery address would promise a service that does not exist.
 * - **Notifications and promotional email now persist.** They were held in
 *   component state and marked here as local-only, on the grounds that no
 *   endpoint stored them — `PATCH /me/settings` has taken `notifPush`,
 *   `notifPromo` and `darkMode` all along. A switch that forgets what it was
 *   set to every time the app restarts is worse than no switch.
 *
 * **The switch moves first and the server is told afterwards**, the same
 * bargain the favourites heart makes: a toggle that waits a round trip does not
 * read as a toggle. A refusal puts it back where it was.
 *
 * A guest has no account to store any of this against, so the two account
 * switches are absent for them — the theme stays, because that one is the
 * device's as well. **Log out** goes the same way, and for a stronger reason:
 * a guest has no session to end, and the button drew itself for them while
 * doing nothing at all for anybody.
 */
export default function SettingsScreen() {
  const { colors, isDark, setPreference } = useTheme();
  const { t, language, setLanguage } = useLanguage();
  const router = useRouter();

  const { user, signOut, updateUser } = useSession();
  const cart = useCart();
  const signedIn = user?.phoneVerified === true;

  const [notifications, setNotifications] = useState(true);
  const [promos, setPromos] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // The name sheet: what is being typed, not what is stored. Opening seeds it
  // from the session, so the field starts on the name it is about to replace
  // rather than empty — this is an edit, not a new answer.
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!signedIn) {
      return;
    }
    let cancelled = false;
    meApi
      .get()
      .then((profile) => {
        if (!cancelled) {
          setNotifications(profile.notifPush);
          setPromos(profile.notifPromo);
        }
      })
      .catch(() => {
        // The defaults above stand. They are the API's own defaults for a new
        // account, so an unreachable server shows what a fresh one would.
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  /**
   * Flips a switch and tells the server.
   *
   * Optimistic, and a refusal puts it back — there is nothing else useful to do
   * with one. Announcing "could not save your notification preference" over a
   * settings screen is noise about a thing the switch itself will show by
   * springing back.
   */
  const save = (
    key: 'notifPush' | 'notifPromo' | 'darkMode',
    value: boolean,
    apply: (on: boolean) => void,
  ): void => {
    apply(value);
    void meApi.settings({ [key]: value }).catch(() => apply(!value));
  };

  /**
   * Ends the session — deliberately, rather than by mis-tap.
   *
   * Confirmed first because undoing it costs an SMS round trip, and because
   * that is what every other destructive action here does (cancelling an order,
   * replacing a basket). **The basket goes with the session**, as it does on the
   * web: it can hold a table booked by the account that is leaving, and the next
   * person to pick up this phone should inherit neither.
   *
   * Then to the auth gate (USER_FLOW.md, "Settings → Auth"), replacing this
   * screen rather than pushing over it — a settings screen for a session that
   * no longer exists is not somewhere to come back to.
   */
  function confirmLogout(): void {
    Alert.alert(t('setLogout'), t('logoutConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('setLogout'),
        style: 'destructive',
        onPress: async () => {
          setLeaving(true);
          cart.clear();
          await signOut();
          setLeaving(false);
          router.replace('/auth');
        },
      },
    ]);
  }

  /**
   * Saves the name, then tells the session what the server accepted.
   *
   * Not optimistic, unlike the switches above: those are one bit that can be
   * put back, while this is text somebody typed and would have to retype. The
   * sheet holds still under a spinner and closes on the answer.
   */
  async function saveName(): Promise<void> {
    const next = normalizeName(draftName);
    if (!isValidName(draftName) || saving) {
      return;
    }
    setSaving(true);
    setNameError(null);
    try {
      const profile = await meApi.update({ name: next });
      // From the response rather than from `next`: the API is what decides what
      // was stored, and the profile header reads this.
      updateUser({ name: profile.name });
      setEditing(false);
    } catch (err) {
      setNameError(err instanceof ApiError ? err.message : t('somethingWentWrong'));
    } finally {
      setSaving(false);
    }
  }

  // Only the name is editable, so "Edit profile" opens one field rather than a
  // screen: email is not collected anywhere in this app and there is no avatar
  // upload, and a form of one input does not need a page of its own. The row is
  // absent for a guest, whose account is this device and has no name to carry
  // (the payment row below is dead for everybody — see SCREENS.md §12).
  const accountRows = [
    ...(signedIn
      ? [
          {
            icon: '👤',
            label: t('setEditProfile'),
            onPress: () => {
              setDraftName(user?.name ?? '');
              setNameError(null);
              setEditing(true);
            },
          },
        ]
      : []),
    { icon: '💳', label: t('profilePaymentMethods') },
  ];
  const aboutRows = [
    { icon: '❓', label: t('setHelp') },
    { icon: '📄', label: t('setTerms') },
    { icon: '🔒', label: t('setPrivacy') },
  ];

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.back, { backgroundColor: colors.card, borderColor: colors.line }]}
        >
          <Svg width={12} height={20} viewBox="0 0 12 20" fill="none">
            <Path
              d="M9 2L2 10l7 8"
              stroke={colors.ink}
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Pressable>
        <Text style={[styles.title, { color: colors.ink }]}>{t('setTitle')}</Text>
      </View>

      <Text style={[styles.section, { color: colors.ink2 }]}>{t('setPrefs')}</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
        {/* The theme is stored on the device *and* on the account: the local
            copy is what paints the first frame before any request lands, and
            the account's is what a second phone starts from. Only the local one
            is waited on. */}
        <ToggleRow
          icon={isDark ? '☀️' : '🌙'}
          label={t('setDarkMode')}
          value={isDark}
          onChange={(next) => {
            setPreference(next ? 'dark' : 'light');
            if (signedIn) {
              void meApi.settings({ darkMode: next }).catch(() => undefined);
            }
          }}
          divider={signedIn}
        />
        {signedIn ? (
          <>
            <ToggleRow
              icon="🔔"
              label={t('setNotifications')}
              value={notifications}
              onChange={(next) => save('notifPush', next, setNotifications)}
              divider
            />
            <ToggleRow
              icon="✉️"
              label={t('setPromos')}
              value={promos}
              onChange={(next) => save('notifPromo', next, setPromos)}
            />
          </>
        ) : null}
      </View>

      <View
        style={[styles.card, styles.languageRow, { backgroundColor: colors.card, borderColor: colors.line }]}
      >
        <Text style={styles.rowIcon}>🌐</Text>
        <Text style={[styles.rowLabel, { color: colors.ink }]}>{t('language')}</Text>
        <View style={[styles.langGroup, { backgroundColor: colors.chip }]}>
          {LANGUAGES.map((code) => {
            const selected = code === language;
            return (
              <Pressable
                key={code}
                onPress={() => setLanguage(code as Language)}
                style={[styles.langButton, selected && { backgroundColor: colors.accent }]}
              >
                <Text style={[styles.langText, { color: selected ? '#fff' : colors.ink2 }]}>
                  {LANGUAGE_LABELS[code as Language]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Text style={[styles.section, { color: colors.ink2 }]}>{t('setAccount')}</Text>
      <RowCard rows={accountRows} />

      <Text style={[styles.section, { color: colors.ink2 }]}>{t('setAbout')}</Text>
      <RowCard rows={aboutRows} />

      {signedIn ? (
        <Pressable
          onPress={confirmLogout}
          disabled={leaving}
          style={[
            styles.logout,
            { backgroundColor: colors.card, borderColor: colors.line, opacity: leaving ? 0.5 : 1 },
          ]}
        >
          {leaving ? (
            <ActivityIndicator color={spot.destructive} />
          ) : (
            <Text style={styles.logoutText}>{t('setLogout')}</Text>
          )}
        </Pressable>
      ) : null}
      <Text style={[styles.version, { color: colors.ink3 }]}>{t('setVersion')} 1.0.0</Text>

      <NameSheet
        visible={editing}
        value={draftName}
        error={nameError}
        saving={saving}
        onChange={(next) => {
          setDraftName(next);
          // The server's refusal was about the text that has just changed.
          setNameError(null);
        }}
        onCancel={() => setEditing(false)}
        onSave={() => void saveName()}
      />
    </ScrollView>
  );
}

function ToggleRow({
  icon,
  label,
  value,
  onChange,
  divider,
}: {
  icon: string;
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
  divider?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.row,
        divider && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
      ]}
    >
      <Text style={styles.rowIcon}>{icon}</Text>
      <Text style={[styles.rowLabel, { color: colors.ink }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.chip, true: colors.accent }}
        thumbColor="#fff"
      />
    </View>
  );
}

/** `onPress` is optional because most of these rows lead nowhere yet — a row
 *  without one is a `View`, so it does not answer a touch it cannot honour. */
function RowCard({ rows }: { rows: { icon: string; label: string; onPress?: () => void }[] }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
      {rows.map((row, index) => {
        const Container = row.onPress ? Pressable : View;
        return (
          <Container
            key={row.label}
            onPress={row.onPress}
            accessibilityRole={row.onPress ? 'button' : undefined}
            style={[
              styles.row,
              index < rows.length - 1 && {
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: colors.line,
              },
            ]}
          >
            <Text style={styles.rowIcon}>{row.icon}</Text>
            <Text style={[styles.rowLabel, { color: colors.ink }]}>{row.label}</Text>
            <Svg width={8} height={14} viewBox="0 0 8 14" fill="none">
              <Path
                d="M1 1l6 6-6 6"
                stroke={colors.ink3}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Container>
        );
      })}
    </View>
  );
}

/**
 * The one field "Edit profile" opens.
 *
 * A bottom sheet rather than a screen, on `PhoneField`'s pattern: one input and
 * two buttons is not a page, and pushing a route for it would put a back
 * gesture where Cancel belongs. The same two-character floor as sign-up
 * (SCREENS.md §0) — a name is required to open an account, so a settings screen
 * that lets it be emptied afterwards would undo that with one keystroke.
 */
function NameSheet({
  visible,
  value,
  error,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  visible: boolean;
  value: string;
  error: string | null;
  saving: boolean;
  onChange: (next: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { colors } = useTheme();
  const t = useTranslate();
  const ready = isValidName(value);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={styles.sheetWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={[styles.scrim, { backgroundColor: colors.scrim }]}
          onPress={onCancel}
          accessibilityLabel={t('cancel')}
        />

        <View style={[styles.sheet, { backgroundColor: colors.bg }]}>
          <View style={[styles.grab, { backgroundColor: colors.line }]} />
          <Text style={[styles.sheetTitle, { color: colors.ink }]}>{t('setEditProfile')}</Text>

          <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>{t('authName')}</Text>
          <TextInput
            value={value}
            onChangeText={onChange}
            placeholder={t('authNamePlaceholder')}
            placeholderTextColor={colors.ink3}
            autoComplete="name"
            textContentType="name"
            maxLength={120}
            autoFocus
            accessibilityLabel={t('authName')}
            style={[
              styles.input,
              { color: colors.ink, backgroundColor: colors.card, borderColor: colors.line },
            ]}
          />
          {/* The requirement is stated where it is broken; the server's own
              refusal takes the same line, since both answer the same button. */}
          {error !== null || (value.length > 0 && !ready) ? (
            <Text style={[styles.fieldHint, { color: colors.danger }]} accessibilityLiveRegion="polite">
              {error ?? t('nameRequired')}
            </Text>
          ) : null}

          <View style={styles.sheetButtons}>
            <Pressable
              onPress={onCancel}
              style={[styles.sheetButton, { borderColor: colors.line, borderWidth: StyleSheet.hairlineWidth }]}
            >
              <Text style={[styles.sheetButtonText, { color: colors.ink2 }]}>{t('cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={onSave}
              disabled={!ready || saving}
              style={[
                styles.sheetButton,
                { backgroundColor: colors.accent, opacity: !ready || saving ? 0.5 : 1 },
              ]}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.sheetButtonText, styles.sheetButtonTextOnAccent]}>
                  {t('save')}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 58, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  back: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 27, fontWeight: '800', letterSpacing: -0.6 },
  section: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 24,
  },
  card: {
    marginTop: 12,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 16,
    paddingVertical: 15,
    marginTop: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  rowIcon: { fontSize: 19, width: 24, textAlign: 'center' },
  rowLabel: { flex: 1, fontSize: 15.5, fontWeight: '500' },
  langGroup: { flexDirection: 'row', gap: 3, borderRadius: 15, padding: 3 },
  langButton: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 13 },
  langText: { fontSize: 12, fontWeight: '700' },
  logout: {
    marginTop: 20,
    height: 52,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // `spot.destructive` — the fixed red of a log-out row, not the theme-aware
  // `danger` used for a failed payment. Read from the token rather than spelled
  // out, now that the spinner that replaces this label wants the same red.
  logoutText: { color: spot.destructive, fontSize: 15.5, fontWeight: '700' },
  version: { textAlign: 'center', fontSize: 12, marginTop: 16 },

  // The name sheet, on the country picker's measurements (`PhoneField`) so the
  // app has one bottom sheet rather than two that nearly match.
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 28, gap: 6 },
  grab: { width: 44, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3, marginBottom: 10 },
  fieldLabel: { fontSize: 12.5, fontWeight: '700' },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 52,
    fontSize: 15.5,
  },
  fieldHint: { fontSize: 12.5, fontWeight: '600' },
  sheetButtons: { flexDirection: 'row', gap: 10, marginTop: 14 },
  sheetButton: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetButtonText: { fontSize: 15.5, fontWeight: '700' },
  sheetButtonTextOnAccent: { color: '#fff' },
});
