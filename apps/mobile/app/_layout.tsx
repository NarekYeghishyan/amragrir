import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CartProvider } from '../src/cart';
import { SessionProvider } from '../src/session';
import { useTheme } from '../src/theme/useTheme';

export default function RootLayout() {
  const { colors, isDark } = useTheme();

  return (
    <SafeAreaProvider>
      <SessionProvider>
        <CartProvider>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.bg },
              headerTintColor: colors.ink,
              headerTitleStyle: { fontWeight: '700' },
              contentStyle: { backgroundColor: colors.bg },
            }}
          >
            <Stack.Screen name="index" options={{ title: 'Amragrir' }} />
            <Stack.Screen name="auth" options={{ title: 'Sign in' }} />
            <Stack.Screen name="restaurant/[id]" options={{ title: '' }} />
            <Stack.Screen name="basket" options={{ title: 'Basket' }} />
            <Stack.Screen name="checkout" options={{ title: 'Checkout' }} />
            {/* No back button: the order exists, and swiping back to checkout
                would offer to place it again. */}
            <Stack.Screen
              name="tracking/[id]"
              options={{ title: 'Your order', headerBackVisible: false }}
            />
          </Stack>
        </CartProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
