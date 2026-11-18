import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, ChevronLeft, Eye, Heart, MessageCircle, Share2 } from 'lucide-react-native';
import { fetchStats, JewelStat } from '../lib/supabase';
import { useStyles, useTheme } from '../ThemeProvider';
import { Palette, radius, serif, space } from '../theme';
import { Chip, Glass, IconButton, Muted, PressableScale, Screen } from '../components/ui';
import type { ScreenProps } from '../navigation';

const PERIODS = [7, 30, 90];

type Metric = 'views' | 'tryons' | 'enquiries' | 'shares' | 'wishlists';

const METRICS: { key: Metric; label: string; Icon: typeof Eye }[] = [
  { key: 'views', label: 'Views', Icon: Eye },
  { key: 'tryons', label: 'Try-ons', Icon: Camera },
  { key: 'enquiries', label: 'Enquiries', Icon: MessageCircle },
  { key: 'shares', label: 'Shares', Icon: Share2 },
  { key: 'wishlists', label: 'Saved', Icon: Heart },
];

export default function InsightsScreen({ navigation }: ScreenProps<'Insights'>) {
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const s = useStyles(makeStyles);
  const [days, setDays] = useState(30);
  const [sortBy, setSortBy] = useState<Metric>('tryons');
  const [stats, setStats] = useState<JewelStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStats(await fetchStats(days));
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load insights');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    const t = { views: 0, tryons: 0, enquiries: 0, shares: 0, wishlists: 0 };
    stats.forEach(r => METRICS.forEach(m => (t[m.key] += r[m.key])));
    return t;
  }, [stats]);

  const sorted = useMemo(() => [...stats].sort((a, b) => b[sortBy] - a[sortBy]), [stats, sortBy]);
  const max = Math.max(1, ...sorted.map(r => r[sortBy]));

  return (
    <Screen>
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <IconButton onPress={navigation.goBack}>
          <ChevronLeft color={c.text} size={24} />
        </IconButton>
        <Text style={s.headerTitle}>Insights</Text>
        <View style={s.spacer} />
      </View>

      <FlatList
        data={loading ? [] : sorted}
        keyExtractor={r => r.jewel_id}
        onRefresh={load}
        refreshing={false}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + space.xl }]}
        ListHeaderComponent={
          <>
            <View style={s.chips}>
              {PERIODS.map(d => (
                <Chip key={d} label={`${d} days`} active={days === d} onPress={() => setDays(d)} />
              ))}
            </View>

            <View style={s.tiles}>
              {METRICS.map(({ key, label, Icon }) => (
                <PressableScale key={key} onPress={() => setSortBy(key)} style={s.tileWrap}>
                  <Glass style={[s.tile, sortBy === key && s.tileActive]}>
                    <Icon color={c.primary} size={18} />
                    <Text style={s.tileValue}>{totals[key].toLocaleString('en-IN')}</Text>
                    <Text style={s.tileLabel}>{label}</Text>
                  </Glass>
                </PressableScale>
              ))}
            </View>

            <Text style={s.sectionLabel}>
              TOP PIECES BY {METRICS.find(m => m.key === sortBy)!.label.toUpperCase()}
            </Text>
            {error && <Text style={s.error}>{error}</Text>}
            {loading && <ActivityIndicator color={c.primary} style={s.loader} />}
          </>
        }
        ListEmptyComponent={
          loading ? undefined : (
            <Glass style={s.empty}>
              <Muted style={s.center}>No activity yet. Stats appear as customers browse.</Muted>
            </Glass>
          )
        }
        renderItem={({ item, index }) => (
          <Glass style={s.row}>
            <Text style={s.rank}>{index + 1}</Text>
            <View style={s.img}>
              <Image source={{ uri: item.image_url }} style={s.flex} resizeMode="contain" />
            </View>
            <View style={s.flex}>
              <Text numberOfLines={1} style={s.name}>
                {item.name}
              </Text>
              <View style={s.barTrack}>
                <View style={[s.barFill, { width: `${(item[sortBy] / max) * 100}%` }]} />
              </View>
              <Text style={s.meta}>
                {item.views} views · {item.tryons} try-ons · {item.enquiries} enquiries
              </Text>
            </View>
            <Text style={s.count}>{item[sortBy]}</Text>
          </Glass>
        )}
      />
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    flex: { flex: 1 },
    center: { textAlign: 'center' },
    spacer: { width: 44 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: space.md,
      paddingBottom: space.sm,
    },
    headerTitle: { fontFamily: serif, fontSize: 22, color: c.text, fontWeight: '700' },
    content: { padding: space.md, gap: space.sm },
    chips: { flexDirection: 'row', gap: 8, marginBottom: space.md },
    tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tileWrap: { width: '31.5%' },
    tile: { padding: 12, borderRadius: radius.md, gap: 4 },
    tileActive: { borderColor: c.primary, borderWidth: 1.5 },
    tileValue: { fontSize: 22, fontWeight: '800', color: c.text },
    tileLabel: { fontSize: 12, color: c.textMuted, fontWeight: '600' },
    sectionLabel: {
      marginTop: space.lg,
      marginBottom: space.sm,
      marginLeft: 6,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 1.4,
      color: c.textMuted,
    },
    error: { color: c.danger, marginBottom: space.sm },
    loader: { marginTop: space.lg },
    empty: { padding: space.xl },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radius.md },
    rank: { width: 20, textAlign: 'center', color: c.primary, fontWeight: '800', fontSize: 15 },
    img: {
      width: 52,
      height: 52,
      borderRadius: radius.sm,
      backgroundColor: c.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.6)',
      padding: 4,
    },
    name: { fontFamily: serif, fontSize: 16, fontWeight: '700', color: c.text },
    barTrack: { height: 6, borderRadius: 3, backgroundColor: c.primarySoft, marginTop: 6, overflow: 'hidden' },
    barFill: { height: 6, borderRadius: 3, backgroundColor: c.primary },
    meta: { fontSize: 11, color: c.textMuted, marginTop: 4 },
    count: { fontSize: 20, fontWeight: '800', color: c.text, minWidth: 36, textAlign: 'right' },
  });
