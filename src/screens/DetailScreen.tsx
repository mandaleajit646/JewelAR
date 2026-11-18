import React, { useEffect } from 'react';
import { Image, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, ChevronLeft, Heart, MessageCircle } from 'lucide-react-native';
import { CURRENCY } from '../config';
import { track } from '../lib/supabase';
import { breakdown, priceOf } from '../lib/pricing';
import { enquireOnWhatsApp } from '../lib/whatsapp';
import { useApp } from '../state';
import { useStyles, useTheme } from '../ThemeProvider';
import { formatPrice, Palette, radius, serif, space } from '../theme';
import { partInfo, PURITIES } from '../types';
import { Button, Glass, IconButton, Muted, Screen } from '../components/ui';
import type { ScreenProps } from '../navigation';

export default function DetailScreen({ route, navigation }: ScreenProps<'Detail'>) {
  const { jewel } = route.params;
  const { items, settings, isWished, toggleWish } = useApp();
  const { c } = useTheme();
  const s = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const price = priceOf(jewel, settings);
  const parts = breakdown(jewel, settings);
  const wished = isWished(jewel.id);

  useEffect(() => {
    track(jewel.id, 'view');
  }, [jewel.id]);

  const tryOn = () => {
    const same = items.filter(j => j.body_part === jewel.body_part);
    const list = same.some(j => j.id === jewel.id) ? same : [jewel, ...same];
    navigation.navigate('TryOn', { items: list, index: list.findIndex(j => j.id === jewel.id) });
  };

  const purityLabel = PURITIES.find(p => p.key === jewel.purity)?.label;
  const specs = [
    purityLabel && jewel.purity !== 'other' && { label: 'Purity', value: purityLabel },
    jewel.metal && { label: 'Metal', value: jewel.metal },
    jewel.weight_g != null && { label: 'Weight', value: `${jewel.weight_g} g` },
    { label: 'Worn on', value: partInfo(jewel.body_part).label },
  ].filter(Boolean) as { label: string; value: string }[];

  const money = (n: number) => formatPrice(n, CURRENCY);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 64, paddingBottom: 140 }}>
        <Glass style={[s.imageWrap, { height: width * 0.9 }]}>
          <Image source={{ uri: jewel.image_url }} style={s.image} resizeMode="contain" />
        </Glass>

        <Glass style={s.body}>
          <Text style={s.category}>{partInfo(jewel.body_part).label.toUpperCase()}</Text>
          <Text style={s.name}>{jewel.name}</Text>
          <Text style={s.price}>{formatPrice(price, CURRENCY)}</Text>
          {parts && <Muted>Based on today's rate · incl. GST</Muted>}

          <View style={s.specs}>
            {specs.map(sp => (
              <View key={sp.label} style={s.spec}>
                <Text style={s.specLabel}>{sp.label}</Text>
                <Text style={s.specValue}>{sp.value}</Text>
              </View>
            ))}
          </View>

          {!!jewel.description && <Muted style={s.desc}>{jewel.description}</Muted>}
        </Glass>

        {parts && (
          <Glass style={s.body}>
            <Text style={s.breakTitle}>Price breakdown</Text>
            <Row label={`Metal (${jewel.weight_g} g × ${money(parts.rate)}/g)`} value={money(parts.metal)} />
            <Row label="Making charges" value={money(parts.making)} />
            {parts.stones > 0 && <Row label="Stones" value={money(parts.stones)} />}
            <Row label={`GST (${settings?.gst_percent ?? 0}%)`} value={money(parts.gst)} />
            <View style={s.divider} />
            <Row label="Total" value={money(parts.total)} bold />
          </Glass>
        )}
      </ScrollView>

      <View style={[s.topBar, { top: insets.top + 10 }]}>
        <IconButton onPress={navigation.goBack}>
          <ChevronLeft color={c.text} size={24} />
        </IconButton>
        <IconButton onPress={() => toggleWish(jewel.id)}>
          <Heart color={wished ? c.primary : c.text} fill={wished ? c.primary : 'none'} size={20} />
        </IconButton>
      </View>

      <View style={[s.bottom, { paddingBottom: insets.bottom + space.md }]}>
        <Button
          title="Enquire"
          variant="glass"
          icon={<MessageCircle color={c.text} size={20} />}
          onPress={() => enquireOnWhatsApp(jewel, price, settings)}
          style={s.flex}
        />
        <Button
          title="Try it on"
          icon={<Camera color={c.onPrimary} size={20} />}
          onPress={tryOn}
          style={s.flex2}
        />
      </View>
    </Screen>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  const s = useStyles(makeStyles);
  return (
    <View style={s.row}>
      <Text style={[s.rowLabel, bold && s.rowBold]}>{label}</Text>
      <Text style={[s.rowValue, bold && s.rowBold]}>{value}</Text>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    flex: { flex: 1 },
    flex2: { flex: 1.4 },
    imageWrap: { marginHorizontal: space.md, padding: space.xl },
    image: { flex: 1 },
    topBar: {
      position: 'absolute',
      left: space.md,
      right: space.md,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    body: { marginHorizontal: space.md, marginTop: space.md, padding: space.lg },
    category: { color: c.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.8 },
    name: { fontFamily: serif, fontSize: 30, color: c.text, fontWeight: '700', marginTop: 6 },
    price: { fontSize: 24, color: c.price, fontWeight: '800', marginTop: 6 },
    specs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: space.lg },
    spec: {
      backgroundColor: c.primarySoft,
      borderRadius: radius.sm,
      paddingVertical: 10,
      paddingHorizontal: 14,
      minWidth: 96,
    },
    specLabel: { fontSize: 11, color: c.textMuted, fontWeight: '600' },
    specValue: { fontSize: 15, color: c.text, fontWeight: '700', marginTop: 2 },
    desc: { marginTop: space.lg, fontSize: 15, lineHeight: 23 },
    breakTitle: { fontFamily: serif, fontSize: 20, fontWeight: '700', color: c.text, marginBottom: space.sm },
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, gap: 12 },
    rowLabel: { flex: 1, color: c.textMuted, fontSize: 14 },
    rowValue: { color: c.text, fontSize: 14, fontWeight: '600' },
    rowBold: { color: c.text, fontSize: 16, fontWeight: '800' },
    divider: { height: 1, backgroundColor: c.glassBorder, marginVertical: 6 },
    bottom: {
      position: 'absolute',
      left: space.md,
      right: space.md,
      bottom: 0,
      flexDirection: 'row',
      gap: space.sm,
    },
  });
