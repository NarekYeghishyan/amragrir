import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '../src/session';
import { useTheme } from '../src/theme/useTheme';

export default function RootLayout() {
  const { colors, isDark } = useTheme();

  return (
    <SafeAreaProvider>
      <SessionProvider>
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
        </Stack>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
