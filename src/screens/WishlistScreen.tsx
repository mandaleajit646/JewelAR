import React from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Camera, Heart, MessageCircle } from 'lucide-react-native';
import { CURRENCY } from '../config';
import { priceOf } from '../lib/pricing';
import { enquireOnWhatsApp } from '../lib/whatsapp';
import { useApp } from '../state';
import { useStyles, useTheme } from '../ThemeProvider';
import { formatPrice, Palette, radius, serif, space, TAB_BAR_SPACE } from '../theme';
import { partInfo } from '../types';
import { Glass, IconButton, Muted, PressableScale, Screen, ThemeToggle, Title } from '../components/ui';
import type { RootStackParams } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParams>;

export default function WishlistScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const { c } = useTheme();
  const s = useStyles(makeStyles);
  const { items, wishlist, toggleWish, settings } = useApp();
  // Keep wishlist order; skip pieces the shop has removed.
  const saved = wishlist.map(id => items.find(j => j.id === id)).filter(Boolean) as typeof items;

  return (
    <Screen>
      <FlatList
        data={saved}
        keyExtractor={j => j.id}
        contentContainerStyle={[
          s.list,
          { paddingTop: insets.top + space.md, paddingBottom: TAB_BAR_SPACE + insets.bottom },
        ]}
        ListHeaderComponent={
          <View style={s.header}>
            <View style={s.flex}>
              <Title>Saved</Title>
              <Muted>{saved.length ? `${saved.length} pieces you love` : 'Your wishlist'}</Muted>
            </View>
            <ThemeToggle />
          </View>
        }
        ListEmptyComponent={
          <Glass style={s.empty}>
            <View style={s.emptyIcon}>
              <Heart color={c.primary} size={30} />
            </View>
            <Text style={s.emptyTitle}>Nothing saved yet</Text>
            <Muted style={s.center}>Tap the ♡ on any piece to save it here and compare later.</Muted>
          </Glass>
        }
        renderItem={({ item }) => {
          const price = priceOf(item, settings);
          return (
            <PressableScale onPress={() => nav.navigate('Detail', { jewel: item })}>
              <Glass style={s.row}>
                <View style={s.img}>
                  <Image source={{ uri: item.image_url }} style={s.flex} resizeMode="contain" />
                </View>
                <View style={s.flex}>
                  <Text style={s.tag}>{partInfo(item.body_part).label.toUpperCase()}</Text>
                  <Text numberOfLines={1} style={s.name}>
                    {item.name}
                  </Text>
                  <Text style={s.price}>{formatPrice(price, CURRENCY)}</Text>
                  <View style={s.actions}>
                    <IconButton
                      style={s.smallBtn}
                      onPress={() => {
                        const same = items.filter(j => j.body_part === item.body_part);
                        nav.navigate('TryOn', { items: same, index: same.findIndex(j => j.id === item.id) });
                      }}>
                      <Camera color={c.text} size={16} />
                    </IconButton>
                    <IconButton style={s.smallBtn} onPress={() => enquireOnWhatsApp(item, price, settings)}>
                      <MessageCircle color={c.text} size={16} />
                    </IconButton>
                  </View>
                </View>
                <Pressable hitSlop={10} onPress={() => toggleWish(item.id)} style={s.heart}>
                  <Heart color={c.primary} fill={c.primary} size={20} />
                </Pressable>
              </Glass>
            </PressableScale>
          );
        }}
      />
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    flex: { flex: 1 },
    center: { textAlign: 'center' },
    list: { paddingHorizontal: space.md, gap: space.sm },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: space.md },
    empty: { alignItems: 'center', padding: space.xl },
    emptyIcon: {
      width: 66,
      height: 66,
      borderRadius: 33,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: space.md,
    },
    emptyTitle: { fontFamily: serif, fontSize: 22, fontWeight: '700', color: c.text, marginBottom: 6 },
    row: { flexDirection: 'row', padding: 10, gap: 12, borderRadius: radius.md },
    img: {
      width: 104,
      height: 104,
      borderRadius: radius.sm,
      backgroundColor: c.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.6)',
      padding: 8,
    },
    tag: { color: c.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginTop: 2 },
    name: { fontFamily: serif, fontSize: 18, fontWeight: '700', color: c.text, marginTop: 2 },
    price: { color: c.price, fontWeight: '800', fontSize: 15, marginTop: 2 },
    actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
    smallBtn: { width: 36, height: 36 },
    heart: { padding: 4 },
  });
