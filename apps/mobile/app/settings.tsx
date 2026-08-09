import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Path, Svg } from 'react-native-svg';
import { Language } from '@amragrir/shared';
import { LANGUAGE_LABELS, LANGUAGES, useLanguage } from '../src/language';
import { useTheme } from '../src/theme/useTheme';

/**
 * Settings — the artifact's SETTINGS screen.
 *
 * Two deliberate departures from what it draws:
 *
 * - **No "delivery addresses" row.** This product has no couriers; an order is
 *   collected or eaten in (docs/AI_CONTEXT.md, "What NOT to do"). A row asking
 *   for a delivery address would promise a service that does not exist.
 * - **Notifications and promotional email are local only.** The artifact toggles
 *   them and no endpoint stores either, so they are held in component state and
 *   marked here rather than pretending to persist a preference.
 */
export default function SettingsScreen() {
  const { colors, isDark, setPreference } = useTheme();
  const { t, language, setLanguage } = useLanguage();
  const router = useRouter();

  const [notifications, setNotifications] = useState(true);
  const [promos, setPromos] = useState(false);

  const accountRows = [{ icon: '👤', label: t('setEditProfile') }, { icon: '💳', label: t('profilePaymentMethods') }];
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
        <ToggleRow
          icon={isDark ? '☀️' : '🌙'}
          label={t('setDarkMode')}
          value={isDark}
          onChange={(next) => setPreference(next ? 'dark' : 'light')}
          divider
        />
        <ToggleRow
          icon="🔔"
          label={t('setNotifications')}
          value={notifications}
          onChange={setNotifications}
          divider
        />
        <ToggleRow icon="✉️" label={t('setPromos')} value={promos} onChange={setPromos} />
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

      <Pressable style={[styles.logout, { backgroundColor: colors.card, borderColor: colors.line }]}>
        <Text style={styles.logoutText}>{t('setLogout')}</Text>
      </Pressable>
      <Text style={[styles.version, { color: colors.ink3 }]}>{t('setVersion')} 1.0.0</Text>
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

function RowCard({ rows }: { rows: { icon: string; label: string }[] }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
      {rows.map((row, index) => (
        <View
          key={row.label}
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
        </View>
      ))}
    </View>
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
  // `danger` used for a failed payment.
  logoutText: { color: '#E23755', fontSize: 15.5, fontWeight: '700' },
  version: { textAlign: 'center', fontSize: 12, marginTop: 16 },
});
