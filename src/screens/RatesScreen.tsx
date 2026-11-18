import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Globe, RefreshCw } from 'lucide-react-native';
import { CURRENCY } from '../config';
import { fetchMarketRates, MarketRates, withPremium } from '../lib/pricing';
import { saveSettings } from '../lib/supabase';
import { useApp } from '../state';
import { useStyles, useTheme } from '../ThemeProvider';
import { Palette, radius, serif, space } from '../theme';
import { Button, Field, Glass, IconButton, Muted, Screen } from '../components/ui';
import type { ScreenProps } from '../navigation';

const num = (v: string) => {
  const n = Number(v.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const str = (v: number | null | undefined) => (v == null ? '' : String(Math.round(v)));

export default function RatesScreen({ navigation }: ScreenProps<'Rates'>) {
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const s = useStyles(makeStyles);
  const { settings, refreshSettings } = useApp();

  const [market, setMarket] = useState<MarketRates | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);

  const [premium, setPremium] = useState(String(settings?.rate_premium_percent ?? 9));
  const [gold24, setGold24] = useState(str(settings?.gold24));
  const [gold22, setGold22] = useState(str(settings?.gold22));
  const [gold18, setGold18] = useState(str(settings?.gold18));
  const [silver, setSilver] = useState(str(settings?.silver));
  const [gst, setGst] = useState(String(settings?.gst_percent ?? 3));
  const [whatsapp, setWhatsapp] = useState(settings?.whatsapp_number ?? '');

  const applyMarket = (m: MarketRates, premiumText: string) => {
    const p = Number(premiumText) || 0;
    setGold24(str(withPremium(m.gold24, p)));
    setGold22(str(withPremium(m.gold22, p)));
    setGold18(str(withPremium(m.gold18, p)));
    setSilver(str(withPremium(m.silver, p)));
  };

  const loadMarket = useCallback(async (fill: boolean) => {
    setFetching(true);
    try {
      const m = await fetchMarketRates();
      setMarket(m);
      setMarketError(null);
      if (fill) applyMarket(m, premium);
    } catch (e: any) {
      setMarketError(e?.message ?? 'Could not reach rate service');
    } finally {
      setFetching(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [premium]);

  useEffect(() => {
    // First visit with no published rates: fill the fields automatically.
    loadMarket(!settings?.gold22);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const publish = async () => {
    const digits = whatsapp.replace(/\D/g, '');
    if (digits && digits.length < 11) {
      return Alert.alert('Check WhatsApp number', 'Include the country code, e.g. 919876543210.');
    }
    setSaving(true);
    try {
      await saveSettings({
        rate_premium_percent: Number(premium) || 0,
        gold24: num(gold24),
        gold22: num(gold22),
        gold18: num(gold18),
        silver: num(silver),
        gst_percent: Number(gst) || 0,
        whatsapp_number: digits,
        rates_updated_at: new Date().toISOString(),
      });
      await refreshSettings();
      Alert.alert('Published', "Today's rates are now live for all customers.");
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Could not publish', e?.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const fmt = (n: number) => `${CURRENCY}${Math.round(n).toLocaleString('en-IN')}`;

  return (
    <Screen>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[s.header, { paddingTop: insets.top + 8 }]}>
          <IconButton onPress={navigation.goBack}>
            <ChevronLeft color={c.text} size={24} />
          </IconButton>
          <Text style={s.headerTitle}>Today's rate</Text>
          <View style={s.spacer} />
        </View>

        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          {/* International reference */}
          <Glass style={s.section}>
            <View style={s.sectionHead}>
              <Globe color={c.primary} size={18} />
              <Text style={s.sectionTitle}>International price</Text>
              <IconButton onPress={() => loadMarket(false)} style={s.smallBtn}>
                {fetching ? <ActivityIndicator color={c.primary} /> : <RefreshCw color={c.text} size={16} />}
              </IconButton>
            </View>
            {market ? (
              <>
                <View style={s.marketRow}>
                  <Market label="24K" value={fmt(market.gold24)} />
                  <Market label="22K" value={fmt(market.gold22)} />
                  <Market label="Silver" value={fmt(market.silver)} />
                </View>
                <Muted style={s.note}>
                  Per gram, {market.date}. World spot price in ₹ — excludes import duty, GST and local
                  premium. Free open-source data (fawazahmed0/exchange-api).
                </Muted>
              </>
            ) : (
              <Muted>{marketError ?? 'Loading…'}</Muted>
            )}
          </Glass>

          {/* Premium + shop rates */}
          <Glass style={s.section}>
            <Text style={s.sectionTitleSolo}>Shop rates (₹ per gram)</Text>
            <View style={s.premiumRow}>
              <View style={s.flex}>
                <Field
                  label="Local premium %"
                  value={premium}
                  onChangeText={setPremium}
                  keyboardType="decimal-pad"
                  placeholder="9"
                />
              </View>
              <Button
                title="Apply"
                variant="glass"
                disabled={!market}
                onPress={() => market && applyMarket(market, premium)}
                style={s.applyBtn}
              />
            </View>
            <Muted style={s.note}>
              Premium covers import duty and local market difference. Adjust it so the rates match your
              local association (e.g. IBJA) rate, or type exact rates below.
            </Muted>
            <View style={s.grid}>
              <View style={s.flex}>
                <Field label="24K gold" value={gold24} onChangeText={setGold24} keyboardType="numeric" />
              </View>
              <View style={s.flex}>
                <Field label="22K gold" value={gold22} onChangeText={setGold22} keyboardType="numeric" />
              </View>
            </View>
            <View style={s.grid}>
              <View style={s.flex}>
                <Field label="18K gold" value={gold18} onChangeText={setGold18} keyboardType="numeric" />
              </View>
              <View style={s.flex}>
                <Field label="Silver" value={silver} onChangeText={setSilver} keyboardType="numeric" />
              </View>
            </View>
          </Glass>

          {/* Shop settings */}
          <Glass style={s.section}>
            <Text style={s.sectionTitleSolo}>Shop settings</Text>
            <Field label="GST %" value={gst} onChangeText={setGst} keyboardType="decimal-pad" placeholder="3" />
            <Field
              label="WhatsApp number (with country code)"
              value={whatsapp}
              onChangeText={setWhatsapp}
              keyboardType="phone-pad"
              placeholder="919876543210"
            />
            <Muted>Customers' "Enquire" button opens a WhatsApp chat with this number.</Muted>
          </Glass>
        </ScrollView>

        <View style={[s.footer, { paddingBottom: insets.bottom + space.md }]}>
          <Button title="Publish rates" onPress={publish} loading={saving} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Market({ label, value }: { label: string; value: string }) {
  const s = useStyles(makeStyles);
  return (
    <View style={s.marketItem}>
      <Text style={s.marketLabel}>{label}</Text>
      <Text style={s.marketValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    flex: { flex: 1 },
    spacer: { width: 44 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: space.md,
      paddingBottom: space.sm,
    },
    headerTitle: { fontFamily: serif, fontSize: 22, color: c.text, fontWeight: '700' },
    content: { padding: space.md, paddingBottom: 130, gap: space.md },
    section: { padding: space.md },
    sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: space.sm },
    sectionTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: c.text },
    sectionTitleSolo: { fontSize: 16, fontWeight: '800', color: c.text, marginBottom: space.md },
    smallBtn: { width: 36, height: 36 },
    marketRow: { flexDirection: 'row', gap: 8 },
    marketItem: { flex: 1, backgroundColor: c.primarySoft, borderRadius: radius.sm, padding: 10 },
    marketLabel: { color: c.textMuted, fontSize: 11, fontWeight: '700' },
    marketValue: { color: c.text, fontSize: 16, fontWeight: '800', marginTop: 2 },
    note: { marginTop: space.sm, marginBottom: space.sm, fontSize: 12, lineHeight: 17 },
    premiumRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
    applyBtn: { marginBottom: space.md, width: 110 },
    grid: { flexDirection: 'row', gap: space.sm },
    footer: { position: 'absolute', left: space.lg, right: space.lg, bottom: 0 },
  });
