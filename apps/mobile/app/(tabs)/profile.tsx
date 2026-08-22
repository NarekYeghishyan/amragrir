import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Path, Svg } from 'react-native-svg';
import { Language } from '@amragrir/shared';
import { me as meApi } from '../../src/api/endpoints';
import type { MeProfile } from '../../src/api/types';
import { LANGUAGE_LABELS, LANGUAGES, useLanguage } from '../../src/language';
import { useSession } from '../../src/session';
import { useTheme } from '../../src/theme/useTheme';

/**
 * Profile — the artifact's PROFILE screen.
 *
 * **The three stat tiles are real.** They were left out for a year on the
 * grounds that "no endpoint reports any of them", which was simply wrong:
 * `GET /me` has returned `rewardPoints`, `ordersCount` and `couponsCount` since
 * before this screen was written, and the web profile has been drawing them the
 * whole time. The artifact's 340/28/3 were mock values, not a claim that the
 * numbers were unavailable.
 *
 * Read on focus rather than once, because the way back here is usually from
 * placing an order — which is one of the three numbers.
 *
 * A guest has no record to show, so the row is absent rather than three zeros:
 * "0 orders" is a statement about somebody, and there is nobody yet. The same
 * reading now governs the menu below it — see `rows`.
 */
export default function ProfileScreen() {
  const { colors } = useTheme();
  const { t, language, setLanguage } = useLanguage();
  const { user } = useSession();
  const router = useRouter();

  const [profile, setProfile] = useState<MeProfile | null>(null);
  const signedIn = user?.phoneVerified === true;

  useFocusEffect(
    useCallback(() => {
      if (!signedIn) {
        setProfile(null);
        return;
      }
      let cancelled = false;
      meApi
        .get()
        .then((result) => {
          if (!cancelled) {
            setProfile(result);
          }
        })
        .catch(() => {
          // The tiles simply stay away. A row of dashes where somebody's record
          // should be says less than no row at all.
        });
      return () => {
        cancelled = true;
      };
    }, [signedIn]),
  );

  // Nobody is asked for a name at sign-in any more (SCREENS.md §0), so an
  // account without one is now the ordinary case: it is identified by the
  // number it verified, the one thing every account here has — the same
  // reading as the web profile. The title used to fall back to "Continue as
  // guest", which is a button's label and nobody's name.
  const name = user?.name?.trim() ?? '';
  const displayName = name || user?.phone || t('navProfile');
  // Digits only: the initial of an E.164 number would otherwise be a "+".
  const initial = (name || user?.phone?.replace(/\D/g, '') || 'A').charAt(0).toUpperCase();
  // Customers sign in by phone; email is optional and usually absent. The
  // number goes under the title only when it is not already the title.
  const subtitle = (name ? user?.phone : null) ?? user?.email ?? '';

  /**
   * The account rows.
   *
   * Five of the six name something an account owns — cards it has saved, orders
   * it has placed, tables it holds, points it has earned, preferences stored
   * against it. A guest owns none of it, so those rows are absent rather than
   * drawn dead: an entry that opens an empty screen, or a sign-in wall behind a
   * chevron, promises a record that does not exist yet. The way to acquire one
   * is the Sign in button above, which is the whole of what this screen can
   * honestly offer somebody with no account.
   *
   * Favourites keeps its row: it is already a tab, so hiding it here hides
   * nothing, and its empty state is a route back to browsing rather than a wall.
   */
  const rows = signedIn
    ? [
        { icon: '💳', label: t('profilePaymentMethods'), onPress: () => router.push('/settings') },
        { icon: '❤️', label: t('profileFavorites'), onPress: () => router.push('/favorites') },
        { icon: '🧾', label: t('profileOrderHistory'), onPress: () => router.push('/orders') },
        // Beside the order history, because they are the same question asked of
        // the other half of the product — what have I got coming.
        { icon: '🪑', label: t('myReservations'), onPress: () => router.push('/bookings') },
        { icon: '🎁', label: t('profileRewards'), onPress: () => router.push('/referral') },
        { icon: '⚙️', label: t('profileSettings'), onPress: () => router.push('/settings') },
      ]
    : [{ icon: '❤️', label: t('profileFavorites'), onPress: () => router.push('/favorites') }];

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.name, { color: colors.ink }]} numberOfLines={1}>
            {displayName}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: colors.ink2 }]}>{subtitle}</Text>
          ) : null}
        </View>
      </View>

      {profile !== null ? (
        <View style={styles.stats}>
          {[
            { value: profile.rewardPoints, label: t('rewardPoints') },
            { value: profile.ordersCount, label: t('ordersCount') },
            { value: profile.couponsCount, label: t('couponsCount') },
          ].map((stat) => (
            <View
              key={stat.label}
              style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.line }]}
            >
              <Text style={[styles.statValue, { color: colors.accent }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: colors.ink2 }]} numberOfLines={1}>
                {stat.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Both doors, named. The gate's two tabs choose a field and not an
          endpoint (`app/auth.tsx`), so this is one flow either way — but a
          guest standing on an empty profile is usually here to *get* an
          account, and "Sign in" on its own is a door for people who already
          have one. Sign up therefore says so outright and takes the accent,
          and `mode=register` opens the tab it promises rather than dropping
          somebody on the log-in tab to find it. That parameter is the web's
          own address for that tab, so neither client invents its own.

          Sign in keeps its place beside it: the artifact reaches this gate
          full-screen, which is not built, so this row is still the only route
          a guest has to a verified phone. */}
      {signedIn ? null : (
        <View style={styles.authRow}>
          <Pressable
            onPress={() => router.push('/auth')}
            style={[styles.authButton, styles.authGhost, { borderColor: colors.accent }]}
          >
            <Text style={[styles.authText, { color: colors.accent }]}>{t('signIn')}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push({ pathname: '/auth', params: { mode: 'register' } })}
            style={[styles.authButton, { backgroundColor: colors.accent }]}
          >
            <Text style={[styles.authText, styles.authTextOnAccent]}>{t('authRegister')}</Text>
          </Pressable>
        </View>
      )}

      <Pressable
        onPress={() => router.push('/referral')}
        style={[styles.referral, { backgroundColor: colors.accent }]}
      >
        <Text style={styles.referralGlyph}>🎁</Text>
        <View style={styles.referralBody}>
          <Text style={styles.referralTitle}>{t('refRowTitle')}</Text>
          <Text style={styles.referralSub}>{t('refRowSub')}</Text>
        </View>
        <Chevron color="#fff" />
      </Pressable>

      <View style={[styles.card, styles.languageRow, { backgroundColor: colors.card, borderColor: colors.line }]}>
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
                <Text
                  style={[styles.langText, { color: selected ? '#fff' : colors.ink2 }]}
                >
                  {LANGUAGE_LABELS[code as Language]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
        {rows.map((row, index) => (
          <Pressable
            key={row.label}
            onPress={row.onPress}
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
            <Chevron color={colors.ink3} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function Chevron({ color }: { color: string }) {
  return (
    <Svg width={8} height={14} viewBox="0 0 8 14" fill="none">
      <Path
        d="M1 1l6 6-6 6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 58, paddingBottom: 110 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  // Three equal tiles, as the artifact draws them.
  stats: { flexDirection: 'row', gap: 10, marginTop: 18 },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statValue: { fontSize: 21, fontWeight: '800', letterSpacing: -0.4 },
  statLabel: { fontSize: 11, fontWeight: '600' },
  avatar: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 26, fontWeight: '800' },
  headerText: { flex: 1, minWidth: 0 },
  name: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { fontSize: 13.5, marginTop: 2 },
  // Two equal halves: neither act is the lesser one, so neither button is
  // narrower. The accent fill is the only thing separating them.
  authRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  authButton: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authGhost: { borderWidth: StyleSheet.hairlineWidth },
  authText: { fontSize: 15.5, fontWeight: '700' },
  authTextOnAccent: { color: '#fff' },
  referral: {
    marginTop: 20,
    borderRadius: 20,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  referralGlyph: { fontSize: 30 },
  referralBody: { flex: 1 },
  referralTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  referralSub: { fontSize: 12.5, color: 'rgba(255,255,255,0.9)', marginTop: 2 },
  card: {
    marginTop: 14,
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
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 16, paddingVertical: 15 },
  rowIcon: { fontSize: 19, width: 24, textAlign: 'center' },
  rowLabel: { flex: 1, fontSize: 15.5, fontWeight: '500' },
  langGroup: { flexDirection: 'row', gap: 3, borderRadius: 15, padding: 3 },
  langButton: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 13 },
  langText: { fontSize: 12, fontWeight: '700' },
});
