import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Path, Svg } from 'react-native-svg';
import { referrals } from '../src/api/endpoints';
import type { ReferralSummary } from '../src/api/types';
import { useTranslate } from '../src/language';
import { useTheme } from '../src/theme/useTheme';

/**
 * Referral — the artifact's REFERRAL screen.
 *
 * **The code comes from `GET /referrals/me`, and can come from nowhere else**
 * (2026-08-11). This screen used to build the link out of the first six
 * characters of the account id, which reads like a code and is not one: no
 * `referrals` row has it, so `attribute()` looks it up, finds nothing, and
 * returns without crediting anybody. Every link shared from this phone was
 * quietly worth nothing to both sides. The real code is minted by that first
 * read — which is why the screen has to ask for it rather than derive it.
 *
 * The counters it draws (friends joined, discount earned) come from the same
 * answer rather than the artifact's hardcoded 3 and 6%: an invented number here
 * is a promise about somebody else's money.
 */
export default function ReferralScreen() {
  const { colors } = useTheme();
  const t = useTranslate();
  const router = useRouter();

  const [copied, setCopied] = useState(false);
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    referrals
      .me()
      .then((result) => {
        if (live) {
          setSummary(result);
        }
      })
      // A guest, or an API that is down. The screen still explains the offer —
      // it just cannot hand out a link, which is better than handing out one
      // that credits nobody.
      .catch(() => undefined)
      .finally(() => {
        if (live) {
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, []);

  const link = summary?.link ?? null;

  const share = async () => {
    if (!link) {
      return;
    }
    try {
      await Share.share({ message: `https://${link}` });
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // The sheet was dismissed. Nothing to report.
    }
  };

  const steps = [t('refStep1'), t('refStep2'), t('refStep3')];

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
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

      <View style={[styles.hero, { backgroundColor: colors.accent }]}>
        <Text style={styles.heroGlyph}>🎁</Text>
        <Text style={styles.heroTitle}>{t('refHeroTitle')}</Text>
        <Text style={styles.heroSub}>{t('refHeroSub')}</Text>
      </View>

      {loading ? <ActivityIndicator style={styles.loading} color={colors.accent} /> : null}

      {link !== null && summary !== null ? (
        <>
          <Text style={[styles.section, { color: colors.ink2 }]}>{t('refYourCode')}</Text>
          <View style={styles.codeRow}>
            <View style={[styles.code, { backgroundColor: colors.card, borderColor: colors.accent }]}>
              <Text style={[styles.codeText, { color: colors.accent }]}>{link}</Text>
            </View>
            <Pressable onPress={share} style={[styles.copy, { backgroundColor: colors.accent }]}>
              <Text style={styles.copyText}>{copied ? t('refCopied') : t('refCopy')}</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={share}
            style={[styles.share, { backgroundColor: colors.card, borderColor: colors.line }]}
          >
            <Text style={[styles.shareText, { color: colors.ink }]}>{t('refShare')}</Text>
          </Pressable>

          {/* The artifact's pair of tiles, with the API's own numbers in them.
              A brand-new account reads 0 and 0% — which is the truth, and the
              reason the steps below it are worth reading. */}
          <View style={styles.stats}>
            <Stat value={String(summary.invitedCount)} label={t('refInvited')} />
            <Stat value={`${summary.discountEarnedPct}%`} label={t('refEarned')} />
          </View>
        </>
      ) : null}

      <Text style={[styles.section, { color: colors.ink2 }]}>{t('refHow')}</Text>
      <View style={styles.steps}>
        {steps.map((text, index) => (
          <View key={text} style={styles.step}>
            <View style={[styles.stepNumber, { backgroundColor: colors.accentSoft }]}>
              <Text style={[styles.stepNumberText, { color: colors.accent }]}>{index + 1}</Text>
            </View>
            <Text style={[styles.stepText, { color: colors.ink }]}>{text}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

/** One of the two counters under the link. */
function Stat({ value, label }: { value: string; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <Text style={[styles.statValue, { color: colors.accent }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.ink2 }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 58, paddingBottom: 40 },
  loading: { marginTop: 28 },
  stats: { flexDirection: 'row', gap: 12, marginTop: 14 },
  stat: {
    flex: 1,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    paddingVertical: 18,
  },
  statValue: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  statLabel: { fontSize: 12, fontWeight: '600', marginTop: 4, textAlign: 'center' },
  back: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: { marginTop: 18, borderRadius: 24, paddingVertical: 26, paddingHorizontal: 22 },
  heroGlyph: { fontSize: 44 },
  heroTitle: { fontSize: 26, fontWeight: '800', color: '#fff', marginTop: 10, letterSpacing: -0.5 },
  heroSub: { fontSize: 13.5, color: 'rgba(255,255,255,0.92)', marginTop: 8, lineHeight: 19 },
  section: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 24,
  },
  codeRow: { flexDirection: 'row', gap: 10, marginTop: 11, alignItems: 'stretch' },
  code: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
  codeText: { fontSize: 14.5, fontWeight: '700', textAlign: 'center' },
  copy: { width: 96, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  copyText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  share: {
    marginTop: 12,
    height: 54,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareText: { fontSize: 15.5, fontWeight: '700' },
  steps: { gap: 14, marginTop: 14 },
  step: { flexDirection: 'row', gap: 13, alignItems: 'flex-start' },
  stepNumber: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { fontSize: 14, fontWeight: '800' },
  stepText: { flex: 1, fontSize: 14, lineHeight: 20, paddingTop: 4 },
});
