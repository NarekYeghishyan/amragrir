import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CartProvider } from '../src/cart';
import { LanguageProvider, useTranslate } from '../src/language';
import { SessionProvider } from '../src/session';
import { ThemeProvider, useTheme } from '../src/theme/useTheme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <RootNavigator />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** Split from `RootLayout` so it renders *inside* `ThemeProvider` and reads the
 *  stored preference rather than the bare OS scheme. */
function RootNavigator() {
  const { colors, isDark } = useTheme();

  return (
    <>
      {/* Outermost of the three: the API client reads the chosen language on
          every request, including the guest handshake `SessionProvider` fires
          on mount. */}
      <LanguageProvider>
        <SessionProvider>
          <CartProvider>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <Navigator />
          </CartProvider>
        </SessionProvider>
      </LanguageProvider>
    </>
  );
}

/**
 * Split again so it sits inside `LanguageProvider` and can translate its own
 * screen titles.
 *
 * The titles are temporary. Every screen the artifact draws carries its own
 * header — its own back button, its own type — and the ones already restyled
 * (`(tabs)`, auth, restaurant) turn the native header off. These remain only
 * for the screens still to be restyled, and each will go the same way.
 */
function Navigator() {
  const { colors } = useTheme();
  const t = useTranslate();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.ink,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="auth" options={{ headerShown: false }} />
      <Stack.Screen name="restaurant/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="referral" options={{ headerShown: false }} />
      {/* Draws its own back button and title, like settings and referral. */}
      <Stack.Screen name="notifications" options={{ headerShown: false }} />
      {/* The booking trio, all self-headered: a table booked on its own, the
          list of them, and one of them. */}
      <Stack.Screen name="book/[branchId]" options={{ headerShown: false }} />
      <Stack.Screen name="bookings" options={{ headerShown: false }} />
      <Stack.Screen name="booking/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="basket" options={{ title: t('basket') }} />
      <Stack.Screen name="checkout" options={{ title: t('checkout') }} />
      {/* No back button: the order exists, and swiping back to checkout would
          offer to place it again. */}
      <Stack.Screen
        name="tracking/[id]"
        options={{ title: t('myOrders'), headerBackVisible: false }}
      />
    </Stack>
  );
}
