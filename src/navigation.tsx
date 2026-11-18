import React, { useCallback, useEffect } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  useNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator, NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomTabBarProps, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Gem, Heart, Store } from 'lucide-react-native';
import { useTheme } from './ThemeProvider';
import { radius } from './theme';
import type { BodyPart, Jewel } from './types';
import { onSharedImages, SharedImage, takeSharedImages } from './native';
import { Glass, GoldFill } from './components/ui';
import HomeScreen from './screens/HomeScreen';
import DetailScreen from './screens/DetailScreen';
import TryOnScreen from './screens/TryOnScreen';
import OwnerScreen from './screens/OwnerScreen';
import EditorScreen from './screens/EditorScreen';
import TeamScreen from './screens/TeamScreen';
import WishlistScreen from './screens/WishlistScreen';
import RatesScreen from './screens/RatesScreen';
import InsightsScreen from './screens/InsightsScreen';
import BulkAddScreen from './screens/BulkAddScreen';
import BookTryOnScreen from './screens/BookTryOnScreen';

/** Fields the AR screen needs - also used for previewing an unsaved item. */
export type TryOnItem = Pick<
  Jewel,
  | 'id'
  | 'name'
  | 'price'
  | 'body_part'
  | 'image_url'
  | 'anchor_x'
  | 'anchor_y'
  | 'size_scale'
  | 'band_3d'
  | 'band_size'
  | 'band_profile'
>;

export type RootStackParams = {
  Tabs: undefined;
  Detail: { jewel: Jewel };
  TryOn: { items: TryOnItem[]; index: number };
  Editor: {
    jewel?: Jewel;
    /** New piece prefilled from a photo (e.g. a book design cut out on the Try-from-book screen). */
    draft?: { uri: string; width: number; height: number; mime: string; part: BodyPart };
  };
  Team: undefined;
  Rates: undefined;
  Insights: undefined;
  BookTryOn: undefined;
  BulkAdd: { images?: SharedImage[]; stamp?: number } | undefined;
};

export type ScreenProps<T extends keyof RootStackParams> = NativeStackScreenProps<RootStackParams, T>;

const Stack = createNativeStackNavigator<RootStackParams>();
const Tab = createBottomTabNavigator();

const TAB_ICONS: Record<string, typeof Gem> = { Shop: Gem, Saved: Heart, Owner: Store };

/** Floating frosted-glass pill tab bar. */
function GlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  return (
    <View style={[styles.tabWrap, { bottom: insets.bottom + 14 }]} pointerEvents="box-none">
      <Glass strong style={styles.tabBar}>
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          const { options } = descriptors[route.key];
          const label = options.title ?? route.name;
          const Icon = TAB_ICONS[route.name] ?? Gem;
          const onPress = () => {
            const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
          };
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              style={styles.tabItem}>
              {focused && <GoldFill />}
              <Icon color={focused ? c.onPrimary : c.textMuted} size={20} />
              {focused && <Text style={[styles.tabLabel, { color: c.onPrimary }]}>{label}</Text>}
            </Pressable>
          );
        })}
      </Glass>
    </View>
  );
}

function renderTabBar(props: BottomTabBarProps) {
  return <GlassTabBar {...props} />;
}

function Tabs() {
  return (
    <Tab.Navigator
      tabBar={renderTabBar}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}>
      <Tab.Screen name="Shop" component={HomeScreen} />
      <Tab.Screen name="Saved" component={WishlistScreen} />
      <Tab.Screen name="Owner" component={OwnerScreen} options={{ title: 'My Shop' }} />
    </Tab.Navigator>
  );
}

export default function Navigation() {
  const { c } = useTheme();
  const navRef = useNavigationContainerRef<RootStackParams>();

  // Photos shared from WhatsApp / Gallery open the "Add many designs" screen.
  const pullShared = useCallback(() => {
    takeSharedImages()
      .then(images => {
        if (images.length && navRef.isReady()) navRef.navigate('BulkAdd', { images, stamp: Date.now() });
      })
      .catch(() => {});
  }, [navRef]);

  useEffect(() => {
    const off = onSharedImages(pullShared);
    const sub = AppState.addEventListener('change', st => st === 'active' && pullShared());
    return () => {
      off();
      sub.remove();
    };
  }, [pullShared]);

  const base = c.isDark ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: { ...base.colors, background: c.bg[0], primary: c.primary, card: c.bg[0], text: c.text },
  };
  return (
    <NavigationContainer ref={navRef} theme={theme} onReady={pullShared}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="Tabs" component={Tabs} />
        <Stack.Screen name="Detail" component={DetailScreen} />
        <Stack.Screen
          name="TryOn"
          component={TryOnScreen}
          options={{ animation: 'fade', statusBarStyle: 'light' }}
        />
        <Stack.Screen name="Editor" component={EditorScreen} options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="Team" component={TeamScreen} />
        <Stack.Screen name="Rates" component={RatesScreen} />
        <Stack.Screen name="Insights" component={InsightsScreen} />
        <Stack.Screen name="BookTryOn" component={BookTryOnScreen} />
        <Stack.Screen name="BulkAdd" component={BulkAddScreen} options={{ animation: 'slide_from_bottom' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  tabBar: { flexDirection: 'row', padding: 6, gap: 6, borderRadius: radius.pill },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    minWidth: 64,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  tabLabel: { fontWeight: '700', fontSize: 14 },
});
