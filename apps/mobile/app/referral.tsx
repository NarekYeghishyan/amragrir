import { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Path, Svg } from 'react-native-svg';
import { useTranslate } from '../src/language';
import { useSession } from '../src/session';
import { useTheme } from '../src/theme/useTheme';

/**
 * Referral — the artifact's REFERRAL screen.
 *
 * The counters it draws (friends joined, discount earned) come from the
 * referrals API rather than the artifact's hardcoded 3 and 6%, and are simply
 * absent until it answers — an invented number here is a promise about somebody
 * else's money.
 */
export default function ReferralScreen() {
  const { colors } = useTheme();
  const t = useTranslate();
  const router = useRouter();
  const { user } = useSession();

  const [copied, setCopied] = useState(false);

  // The code is the customer's own; until the referrals endpoint is wired into
  // this app there is nothing truthful to show, so the link is built from the
  // account id the session already carries.
  const code = user?.id ? user.id.slice(0, 6).toUpperCase() : null;
  const link = code ? `amragrir.am/i/${code}` : null;

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

      {link ? (
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

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 58, paddingBottom: 40 },
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
