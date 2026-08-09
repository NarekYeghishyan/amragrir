import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Path, Svg } from 'react-native-svg';
import { notifications as notificationsApi } from '../api/endpoints';
import { subscribeToMyNotifications } from '../order-stream';
import { useTranslate } from '../language';
import { useTheme } from '../theme/useTheme';
import { useSession } from '../session';

/**
 * The header bell.
 *
 * The kitchen moves an order from the back office and the customer is told —
 * wherever they are in the app, which is the whole reason this exists beside
 * the tracking screen. That screen reports the one order it is showing, and
 * somebody browsing for their next meal was hearing nothing.
 *
 * **The count arrives two ways and that is deliberate.** `GET /notifications`
 * on mount and on focus gives the true number, including everything that
 * happened while the app was backgrounded; the socket keeps it true while the
 * app is open. A socket alone would miss the backgrounded case, and a fetch
 * alone would leave the badge stale for as long as somebody stared at it.
 *
 * Nothing is drawn for a guest — there is no order to be told about, and the
 * API refuses both the list and the subscription for one.
 */
export function NotificationBell() {
  const { colors } = useTheme();
  const t = useTranslate();
  const router = useRouter();
  const { user } = useSession();
  const [unread, setUnread] = useState(0);
  const signedIn = Boolean(user?.phoneVerified);

  const refresh = useCallback(() => {
    if (!signedIn) {
      setUnread(0);
      return;
    }
    notificationsApi
      .list()
      .then((bell) => setUnread(bell.unread))
      .catch(() => {
        // A count that failed to load leaves the bell without a badge. There is
        // nothing here a guest could do about it, and the screen behind it
        // reloads the list itself.
      });
  }, [signedIn]);

  // On focus rather than only on mount: this sits in a tab that stays mounted
  // while the app is backgrounded, so mount fires once and a returning reader
  // would otherwise see the badge they left behind.
  useFocusEffect(refresh);

  useEffect(() => {
    if (!signedIn) {
      return;
    }
    // Counted rather than re-fetched: the frame is the notification, so the
    // badge can move without asking the server what it already just said.
    return subscribeToMyNotifications({ onNotification: () => setUnread((n) => n + 1) });
  }, [signedIn]);

  if (!signedIn) {
    return null;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('notifications')}
      onPress={() => router.push('/notifications')}
      style={[styles.button, { backgroundColor: colors.card, borderColor: colors.line }]}
    >
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Path
          d="M6 9a6 6 0 1112 0c0 3.5.7 5.2 1.5 6.2.4.5 0 1.3-.7 1.3H5.2c-.7 0-1.1-.8-.7-1.3C5.3 14.2 6 12.5 6 9z"
          stroke={colors.ink}
          strokeWidth={2}
          strokeLinejoin="round"
        />
        <Path d="M10 20a2 2 0 004 0" stroke={colors.ink} strokeWidth={2} strokeLinecap="round" />
      </Svg>
      {unread > 0 && (
        <View style={[styles.badge, { backgroundColor: colors.accent, borderColor: colors.bg }]}>
          <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 5,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10.5, fontWeight: '800' },
});
