import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  countryOptions,
  flagOf,
  formatNational,
  isValidNational,
  phoneCountry,
  type PhoneCountry,
} from '@amragrir/shared';
import { useLanguage, useTranslate } from '../language';
import { retypeNational } from '../phone';
import { useTheme } from '../theme/useTheme';

/**
 * Country, then the number — the phone field the sign-in screen collects.
 *
 * The web has had this since the sign-in page was built; the phone had a fixed
 * `+374` printed beside the field and would send anything at least six digits
 * long. Both halves of that were wrong: a customer with a Russian or a French
 * number could not sign in at all, and an Armenian one could send seven digits
 * and get the API's refusal back as an error banner instead of being told, in
 * the field, that the number is the wrong length.
 *
 * The country is **chosen, not inferred**, as on the web: `0…` means different
 * numbers in different places, and a picked country removes the ambiguity
 * before the number reaches the API. What is sent is E.164 — `toE164` in the
 * caller — which is the one spelling `users.phone` is unique on.
 *
 * Everything that decides whether a number is accepted comes from
 * `@amragrir/shared`: `PHONE_COUNTRIES` for the list, `formatNational` for the
 * shape and the length cap, `isValidNational` for the check. That is the same
 * module the web field and the API's `normalizePhone` read, so this screen
 * cannot offer a country the server rejects, nor accept a length it refuses.
 *
 * A picker sheet rather than a wheel: eight countries fit on one screen, and
 * `Picker` would be a native module for one control.
 */
export function PhoneField({
  country,
  national,
  onChangeCountry,
  onChangeNational,
  autoFocus = false,
}: {
  country: PhoneCountry;
  national: string;
  /** Re-spells the number in the new country's grouping — the field does it. */
  onChangeCountry: (country: PhoneCountry) => void;
  onChangeNational: (national: string) => void;
  autoFocus?: boolean;
}) {
  const { colors } = useTheme();
  const { language } = useLanguage();
  const t = useTranslate();

  const [picking, setPicking] = useState(false);
  const [left, setLeft] = useState(false);

  const options = useMemo(() => countryOptions(language), [language]);

  function choose(code: string) {
    setPicking(false);
    const next = phoneCountry(code);
    if (!next || next.code === country.code) {
      return;
    }
    onChangeCountry(next);
    // A number already typed keeps its digits and takes the new grouping,
    // rather than being cleared: switching country is usually a correction to
    // a number somebody has already written out.
    onChangeNational(formatNational(next, national));
  }

  const digits = national.replace(/\D/g, '');
  const valid = isValidNational(country, national);
  // Silence while they are still typing: a number is not "wrong" until it is at
  // least as long as a right one would be — or until they have left the field,
  // which says they consider it finished.
  const longest = Math.max(...country.nationalLengths);
  const showHint = digits.length > 0 && !valid && (left || digits.length >= longest);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.ink2 }]}>{t('phoneLabel')}</Text>

      <View
        style={[
          styles.row,
          {
            backgroundColor: colors.card,
            borderColor: showHint ? colors.danger : colors.line,
          },
        ]}
      >
        {/* The dial code leads, and the country name is not on this row at all:
            the design prints a plain "+374" here, and the flag plus the dial
            code is the whole of what has to stay legible next to the number. */}
        <Pressable
          onPress={() => setPicking(true)}
          accessibilityRole="button"
          accessibilityLabel={t('countryLabel')}
          accessibilityValue={{ text: `+${country.dial}` }}
          style={styles.country}
        >
          <Text style={styles.flag}>{flagOf(country.code)}</Text>
          <Text style={[styles.dial, { color: colors.ink }]}>+{country.dial}</Text>
          <Text style={[styles.caret, { color: colors.ink3 }]}>▾</Text>
        </Pressable>

        <View style={[styles.divider, { backgroundColor: colors.line }]} />

        {/* No dial code inside the field: the button beside it already carries
            one, and two "+374"s on one row is the same fact printed twice. */}
        <TextInput
          value={national}
          onChangeText={(typed) => onChangeNational(retypeNational(country, national, typed))}
          onFocus={() => setLeft(false)}
          onBlur={() => setLeft(true)}
          // The country's own specimen number, so the placeholder teaches the
          // length the field will actually accept.
          placeholder={country.example}
          placeholderTextColor={colors.ink3}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel-national"
          autoFocus={autoFocus}
          accessibilityLabel={t('phoneLabel')}
          style={[styles.input, { color: colors.ink }]}
        />
      </View>

      {showHint ? (
        <Text style={[styles.hint, { color: colors.danger }]} accessibilityLiveRegion="polite">
          {t('phoneInvalid')}
        </Text>
      ) : null}

      <Modal
        visible={picking}
        transparent
        animationType="slide"
        onRequestClose={() => setPicking(false)}
      >
        <View style={styles.sheetWrap}>
          <Pressable
            style={[styles.scrim, { backgroundColor: colors.scrim }]}
            onPress={() => setPicking(false)}
            accessibilityLabel={t('countryLabel')}
          />

          <View style={[styles.sheet, { backgroundColor: colors.bg }]}>
            <View style={styles.head}>
              <View style={[styles.grab, { backgroundColor: colors.line }]} />
              <Text style={[styles.title, { color: colors.ink }]}>{t('countryLabel')}</Text>
            </View>

            <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
              {options.map((option) => {
                const selected = option.code === country.code;
                return (
                  <Pressable
                    key={option.code}
                    onPress={() => choose(option.code)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={[
                      styles.option,
                      {
                        borderColor: selected ? colors.accent : colors.line,
                        backgroundColor: selected ? colors.accentSoft : colors.card,
                      },
                    ]}
                  >
                    <Text style={styles.flag}>{option.flag}</Text>
                    {/* The name may fall back to the ISO code where the runtime
                        has no `Intl.DisplayNames` — see `countryOptions`. The
                        flag and the dial code are what identify the row. */}
                    <Text
                      numberOfLines={1}
                      style={[styles.name, { color: selected ? colors.accent : colors.ink }]}
                    >
                      {option.name}
                    </Text>
                    <Text style={[styles.optionDial, { color: colors.ink2 }]}>+{option.dial}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 12.5, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 14,
    paddingRight: 8,
  },
  country: { flexDirection: 'row', alignItems: 'center', gap: 6, height: '100%' },
  flag: { fontSize: 18 },
  dial: { fontSize: 15.5, fontWeight: '700' },
  caret: { fontSize: 11, marginTop: 1 },
  divider: { width: 1, height: 24, marginHorizontal: 12 },
  input: { flex: 1, height: '100%', fontSize: 15.5, letterSpacing: 0.5 },
  hint: { fontSize: 12.5, fontWeight: '600' },

  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill },
  sheet: { maxHeight: '72%', borderTopLeftRadius: 26, borderTopRightRadius: 26 },
  head: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  grab: { width: 44, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  list: { padding: 16, gap: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  name: { flex: 1, fontSize: 15, fontWeight: '700' },
  optionDial: { fontSize: 14.5, fontWeight: '700' },
});
