import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BookOpen, Camera, ChevronRight, Coins, Heart, Search, Sparkles } from 'lucide-react-native';
import { CURRENCY, SHOP_NAME } from '../config';
import { priceOf } from '../lib/pricing';
import { useApp } from '../state';
import { useStyles, useTheme } from '../ThemeProvider';
import { formatPrice, Palette, radius, serif, space, TAB_BAR_SPACE } from '../theme';
import { BODY_PARTS, BodyPart, Jewel, partInfo } from '../types';
import { Chip, Glass, Muted, PressableScale, Screen, Skeleton, ThemeToggle } from '../components/ui';
import type { RootStackParams } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParams>;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const { width } = useWindowDimensions();
  const { c } = useTheme();
  const s = useStyles(makeStyles);
  const { items, loading, error, refresh } = useApp();
  const [part, setPart] = useState<BodyPart | 'all'>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(
    () =>
      items.filter(
        j =>
          (part === 'all' || j.body_part === part) &&
          j.name.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [items, part, query],
  );

  const cardW = (width - space.md * 2 - space.sm) / 2;

  const openTryOn = () => {
    if (!filtered.length) return;
    const first = filtered[0];
    nav.navigate('TryOn', { items: filtered.filter(j => j.body_part === first.body_part), index: 0 });
  };

  const header = (
    <View>
      <View style={[s.top, { paddingTop: insets.top + space.md }]}>
        <View style={s.flex}>
          <Text style={s.welcome}>Welcome to</Text>
          <Text style={s.shop}>{SHOP_NAME}</Text>
        </View>
        <ThemeToggle />
      </View>

      <Glass strong sheen={false} style={s.search}>
        <Search color={c.textMuted} size={20} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search earrings, rings, necklaces…"
          placeholderTextColor={c.placeholder}
          style={s.searchInput}
        />
      </Glass>

      <RateCard />

      <PressableScale onPress={openTryOn}>
        <Glass style={s.hero}>
          <View style={s.flex}>
            <View style={s.heroBadge}>
              <Sparkles color={c.primary} size={14} />
              <Text style={s.heroBadgeText}>LIVE AR TRY-ON</Text>
            </View>
            <Text style={s.heroTitle}>See it on you{'\n'}before you buy</Text>
            <Text style={s.heroSub}>Point your camera — jewellery fits automatically.</Text>
          </View>
          <View style={s.heroIcon}>
            <Camera color={c.onPrimary} size={26} />
          </View>
        </Glass>
      </PressableScale>

      <PressableScale onPress={() => nav.navigate('BookTryOn')}>
        <Glass style={s.book}>
          <View style={s.bookIcon}>
            <BookOpen color={c.primary} size={20} />
          </View>
          <View style={s.flex}>
            <Text style={s.bookTitle}>Try from the book</Text>
            <Muted style={s.bookSub}>Snap any design from the catalogue book</Muted>
          </View>
          <ChevronRight color={c.textMuted} size={20} />
        </Glass>
      </PressableScale>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        <Chip label="All" active={part === 'all'} onPress={() => setPart('all')} />
        {BODY_PARTS.map(p => (
          <Chip key={p.key} label={p.label} active={part === p.key} onPress={() => setPart(p.key)} />
        ))}
      </ScrollView>

      {error && <Text style={s.error}>{error}</Text>}
    </View>
  );

  return (
    <Screen>
      <FlatList
        data={loading && !items.length ? [] : filtered}
        keyExtractor={j => j.id}
        numColumns={2}
        ListHeaderComponent={header}
        columnWrapperStyle={s.column}
        contentContainerStyle={[s.list, { paddingBottom: TAB_BAR_SPACE + insets.bottom }]}
        refreshControl={
          <RefreshControl refreshing={loading && !!items.length} onRefresh={refresh} tintColor={c.primary} />
        }
        renderItem={({ item }) => (
          <JewelCard jewel={item} width={cardW} onPress={() => nav.navigate('Detail', { jewel: item })} />
        )}
        ListEmptyComponent={
          loading ? (
            <View style={s.skeletonRow}>
              {[0, 1, 2, 3].map(i => (
                <Skeleton key={i} style={[s.skeleton, { width: cardW, height: cardW + 72 }]} />
              ))}
            </View>
          ) : (
            <Glass style={s.empty}>
              <Text style={s.emptyTitle}>No jewellery yet</Text>
              <Muted style={s.center}>New pieces from the shop will appear here.</Muted>
            </Glass>
          )
        }
      />
    </Screen>
  );
}

/** Today's published gold & silver rate (gold per 10 g, silver per kg - as Indian shops quote). */
function RateCard() {
  const s = useStyles(makeStyles);
  const { c } = useTheme();
  const { settings } = useApp();
  if (!settings?.gold22 && !settings?.gold24 && !settings?.silver) return null;
  const rows = [
    { label: '22K Gold', value: settings.gold22, unit: '/10g', mult: 10 },
    { label: '24K Gold', value: settings.gold24, unit: '/10g', mult: 10 },
    { label: 'Silver', value: settings.silver, unit: '/kg', mult: 1000 },
  ].filter(r => r.value);
  const updated = settings.rates_updated_at
    ? new Date(settings.rates_updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : '';
  return (
    <Glass style={s.rateCard}>
      <View style={s.rateHead}>
        <Coins color={c.primary} size={16} />
        <Text style={s.rateTitle}>TODAY'S RATE</Text>
        {!!updated && <Text style={s.rateDate}>{updated}</Text>}
      </View>
      <View style={s.rateRow}>
        {rows.map(r => (
          <View key={r.label} style={s.rateItem}>
            <Text style={s.rateLabel}>{r.label}</Text>
            <Text style={s.rateValue} numberOfLines={1} adjustsFontSizeToFit>
              {CURRENCY}
              {Math.round((r.value ?? 0) * r.mult).toLocaleString('en-IN')}
            </Text>
            <Text style={s.rateUnit}>{r.unit}</Text>
          </View>
        ))}
      </View>
    </Glass>
  );
}

function JewelCard({ jewel, width, onPress }: { jewel: Jewel; width: number; onPress: () => void }) {
  const s = useStyles(makeStyles);
  const { c } = useTheme();
  const { settings, isWished, toggleWish } = useApp();
  const wished = isWished(jewel.id);
  return (
    <PressableScale onPress={onPress} style={{ width }}>
      <Glass style={s.card}>
        <View style={[s.cardImageWrap, { height: width - 12 }]}>
          <Image source={{ uri: jewel.image_url }} style={s.cardImage} resizeMode="contain" />
          <View style={s.cardTag}>
            <Text style={s.cardTagText}>{partInfo(jewel.body_part).label}</Text>
          </View>
          <Pressable hitSlop={8} onPress={() => toggleWish(jewel.id)} style={s.heart}>
            <Heart color={wished ? c.primary : c.textMuted} fill={wished ? c.primary : 'none'} size={18} />
          </Pressable>
        </View>
        <View style={s.cardBody}>
          <Text numberOfLines={1} style={s.cardName}>
            {jewel.name}
          </Text>
          <Text style={s.cardPrice}>{formatPrice(priceOf(jewel, settings), CURRENCY)}</Text>
        </View>
      </Glass>
    </PressableScale>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    book: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      borderRadius: radius.md,
      marginHorizontal: space.md,
      marginBottom: space.md,
    },
    bookIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bookTitle: { fontSize: 15, fontWeight: '800', color: c.text },
    bookSub: { fontSize: 12, marginTop: 2 },
    flex: { flex: 1 },
    center: { textAlign: 'center' },
    list: { gap: space.sm },
    column: { gap: space.sm, paddingHorizontal: space.md },
    top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingBottom: space.md },
    welcome: { color: c.textMuted, fontSize: 15, fontWeight: '600' },
    shop: { fontFamily: serif, fontSize: 34, color: c.text, fontWeight: '700', marginTop: 2 },
    search: {
      marginHorizontal: space.md,
      height: 52,
      borderRadius: radius.pill,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 18,
      gap: 10,
    },
    searchInput: { flex: 1, fontSize: 15, color: c.text },
    hero: { margin: space.md, padding: space.lg, flexDirection: 'row', alignItems: 'center' },
    heroBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 10,
      alignSelf: 'flex-start',
      backgroundColor: c.primarySoft,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: radius.pill,
    },
    heroBadgeText: { color: c.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
    heroTitle: { fontFamily: serif, color: c.text, fontSize: 25, lineHeight: 31, fontWeight: '700' },
    heroSub: { color: c.textMuted, marginTop: 8, fontSize: 13 },
    heroIcon: {
      width: 62,
      height: 62,
      borderRadius: 31,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: space.md,
      shadowColor: c.primary,
      shadowOpacity: 0.5,
      shadowRadius: 16,
      elevation: 8,
    },
    chips: { paddingHorizontal: space.md, gap: 8, paddingBottom: space.md },
    error: { color: c.danger, marginHorizontal: space.md, marginBottom: space.sm },
    card: { borderRadius: radius.md, padding: 6 },
    cardImageWrap: {
      borderRadius: radius.sm,
      backgroundColor: c.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.55)',
      padding: space.md,
    },
    cardImage: { width: '100%', height: '100%' },
    cardTag: {
      position: 'absolute',
      top: 8,
      left: 8,
      backgroundColor: c.primarySoft,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radius.pill,
    },
    cardTagText: { fontSize: 11, fontWeight: '700', color: c.primary },
    heart: {
      position: 'absolute',
      top: 6,
      right: 6,
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.glassStrong,
      borderWidth: 1,
      borderColor: c.glassBorder,
    },
    rateCard: { marginHorizontal: space.md, marginTop: space.md, padding: space.md },
    rateHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
    rateTitle: { flex: 1, color: c.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
    rateDate: { color: c.textMuted, fontSize: 12, fontWeight: '600' },
    rateRow: { flexDirection: 'row', gap: 8 },
    rateItem: {
      flex: 1,
      backgroundColor: c.primarySoft,
      borderRadius: radius.sm,
      paddingVertical: 10,
      paddingHorizontal: 10,
    },
    rateLabel: { color: c.textMuted, fontSize: 11, fontWeight: '700' },
    rateValue: { color: c.text, fontSize: 16, fontWeight: '800', marginTop: 3 },
    rateUnit: { color: c.textMuted, fontSize: 11 },
    cardBody: { paddingHorizontal: 8, paddingTop: 10, paddingBottom: 8 },
    cardName: { fontFamily: serif, fontSize: 16, fontWeight: '700', color: c.text },
    cardPrice: { fontSize: 14, color: c.price, fontWeight: '800', marginTop: 3 },
    skeletonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingHorizontal: space.md },
    skeleton: { borderRadius: radius.md },
    empty: { alignItems: 'center', padding: space.xl, marginHorizontal: space.md },
    emptyTitle: { fontSize: 20, fontWeight: '800', color: c.text, marginBottom: 6 },
  });
