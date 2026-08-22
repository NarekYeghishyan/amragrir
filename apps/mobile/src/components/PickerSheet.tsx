import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLanguage } from '../language';
import { useTheme } from '../theme/useTheme';

/**
 * The bottom sheet the two time pickers on "When & how" open into.
 *
 * **A wheel cannot share a screen with a scrolling page.** Both pickers used to
 * unfold in place, which put a vertical scroll inside a vertical scroll: a drag
 * that meant "turn the hour" was as likely to be read as "scroll the checkout",
 * and on a phone that is the difference between a control that works and one
 * that fights back. Lifted onto a fixed sheet the wheel is the only thing that
 * scrolls, so every drag over it means what it looks like.
 *
 * The same `Modal` the filter and location sheets use — scrim, slide, grabber,
 * one ✕ — so this is the app's existing sheet rather than a second kind of
 * overlay invented for the clock.
 *
 * **The ✕ is not the "Done" button in disguise.** Nothing is confirmed here:
 * the choice has already been reported by the time it is pressed, and the row
 * behind the sheet is showing it. It closes an overlay, which is the one thing
 * an overlay always needs and the inline panel never did.
 */
export function PickerSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  /** Names the question, and is what the folded row behind it is headed. */
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const { t } = useLanguage();

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.wrap}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={t('close')} />

        <View style={[styles.sheet, { backgroundColor: colors.bg }]}>
          <View style={styles.head}>
            <View style={[styles.grab, { backgroundColor: colors.line }]} />
            <View style={styles.headRow}>
              <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={t('close')}
                style={[styles.close, { borderColor: colors.line, backgroundColor: colors.card }]}
              >
                <Text style={[styles.closeText, { color: colors.ink }]}>✕</Text>
              </Pressable>
            </View>
          </View>

          {/* Deliberately not a ScrollView. Everything a picker asks is meant to
              fit, because an outer scroll here would put back the very nesting
              this sheet exists to remove. */}
          <View style={styles.body}>{children}</View>
        </View>
      </View>
    </Modal>
  );
}

// The filter sheet's measurements, so the two read as one control in two places.
const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.42)' },
  sheet: { maxHeight: '92%', borderTopLeftRadius: 26, borderTopRightRadius: 26 },
  head: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  grab: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 21, fontWeight: '800', letterSpacing: -0.4 },
  close: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontSize: 15, fontWeight: '700' },
  body: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 28 },
});
