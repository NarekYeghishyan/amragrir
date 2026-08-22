import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  FavoritesIcon,
  HomeIcon,
  OrdersIcon,
  ProfileIcon,
  SearchIcon,
} from '../../src/components/TabIcons';
import { useTranslate } from '../../src/language';
import { useTheme } from '../../src/theme/useTheme';

/**
 * The five tabs from the artifact: home, search, orders, favorites, profile.
 *
 * Only these five carry the bar. Everything reached *from* a tab — a
 * restaurant, the basket, checkout, tracking — is a route outside this group
 * and covers it, which is what the artifact's own `showTabBar` does (it is true
 * for exactly this list).
 */
export default function TabsLayout() {
  const { colors } = useTheme();
  const t = useTranslate();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.ink3,
        // 10.5px/600 with a 4px gap under the glyph, per the artifact.
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '600', marginTop: 4 },
        tabBarItemStyle: { paddingVertical: 4 },
        tabBarStyle: {
          position: 'absolute',
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.line,
          // The blur below supplies the surface; a solid colour here would sit
          // on top of it and defeat the whole effect.
          backgroundColor: 'transparent',
          elevation: 0,
          height: 58 + insets.bottom,
          paddingTop: 10,
        },
        // `background:var(--glass); backdrop-filter:blur(18px) saturate(180%)`
        // in the artifact — which is a tinted panel *and* a blur, not a blur
        // alone. `colors.glass` is that panel; without it the bar was however
        // much tint `intensity={18}` happened to produce, and a card scrolling
        // under it read straight through. `tint` follows the theme so the bar
        // stays readable over both a white card and a dark one.
        tabBarBackground: () => (
          <BlurView
            intensity={18}
            tint="systemChromeMaterial"
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.glass }]}
          />
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('navHome'), tabBarIcon: ({ color }) => <HomeIcon color={color} /> }}
      />
      <Tabs.Screen
        name="search"
        options={{ title: t('navSearch'), tabBarIcon: ({ color }) => <SearchIcon color={color} /> }}
      />
      <Tabs.Screen
        name="orders"
        options={{ title: t('navOrders'), tabBarIcon: ({ color }) => <OrdersIcon color={color} /> }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: t('navFavorites'),
          tabBarIcon: ({ color }) => <FavoritesIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('navProfile'),
          tabBarIcon: ({ color }) => <ProfileIcon color={color} />,
        }}
      />
    </Tabs>
  );
}
