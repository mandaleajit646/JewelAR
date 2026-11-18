import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Linking,
  Modal,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Download, Hand, Heart, MessageCircle, RotateCcw, ScanFace, Share2, SwitchCamera, X } from 'lucide-react-native';
import { ARTryOnCommands, ARTryOnView, saveToGallery, shareImage } from '../native';
import { CURRENCY, SHOP_NAME } from '../config';
import { track } from '../lib/supabase';
import { priceOf } from '../lib/pricing';
import { enquireOnWhatsApp } from '../lib/whatsapp';
import { useApp } from '../state';
import { useStyles, useTheme } from '../ThemeProvider';
import { formatPrice, Palette, radius, serif, space } from '../theme';
import { bandInnerMm, bandThickMm, isBandPart, partInfo } from '../types';
import { Button, GoldFill, IconButton, PressableScale, Screen } from '../components/ui';
import type { ScreenProps } from '../navigation';

type Permission = 'checking' | 'granted' | 'denied';

const WHITE = '#FFFFFF';
// Glass over a live camera is always dark so it stays readable in both themes.
const MEDIA_GLASS = 'rgba(20,14,6,0.45)';
const MEDIA_BORDER = 'rgba(255,255,255,0.22)';
const GOLD = '#ECCB7E';

export default function TryOnScreen({ route, navigation }: ScreenProps<'TryOn'>) {
  const { items } = route.params;
  const insets = useSafeAreaInsets();
  const s = useStyles(makeStyles);
  const { c } = useTheme();
  const { items: catalogue, settings, isWished, toggleWish } = useApp();
  const arRef = useRef<React.ElementRef<typeof ARTryOnView>>(null);
  const [index, setIndex] = useState(route.params.index);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [tracking, setTracking] = useState(false);
  const [permission, setPermission] = useState<Permission>('checking');
  const [capturing, setCapturing] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState<'share' | 'save' | null>(null);
  const hintOpacity = useRef(new Animated.Value(1)).current;
  const flash = useRef(new Animated.Value(0)).current;

  const item = items[index];
  const full = catalogue.find(j => j.id === item.id);
  const price = full ? priceOf(full, settings) : item.price;
  const info = partInfo(item.body_part);
  const isHand = item.body_part === 'finger' || item.body_part === 'wrist';
  const isPreview = item.id === 'preview';

  useEffect(() => {
    (async () => {
      if (Platform.OS !== 'android') return setPermission('granted');
      const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
      setPermission(r === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied');
    })();
  }, []);

  useEffect(() => {
    track(item.id, 'tryon');
  }, [item.id]);

  useEffect(() => {
    Animated.timing(hintOpacity, { toValue: tracking ? 0 : 1, duration: 250, useNativeDriver: true }).start();
  }, [tracking, hintOpacity]);

  const snap = () => {
    if (!arRef.current || capturing) return;
    setCapturing(true);
    flash.setValue(1);
    Animated.timing(flash, { toValue: 0, duration: 350, useNativeDriver: true }).start();
    ARTryOnCommands.capture(arRef.current);
  };

  const share = async () => {
    if (!photo) return;
    setBusy('share');
    try {
      await shareImage(photo, `Trying on *${item.name}* from ${SHOP_NAME} ✨ How does it look?`);
      track(item.id, 'share');
    } catch (e: any) {
      Alert.alert('Could not share', e?.message ?? '');
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!photo) return;
    setBusy('save');
    try {
      await saveToGallery(photo, SHOP_NAME);
      Alert.alert('Saved', 'The photo is in your gallery.');
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? '');
    } finally {
      setBusy(null);
    }
  };

  if (permission === 'denied') {
    return (
      <Screen style={s.permRoot}>
        <Text style={s.permTitle}>Camera access needed</Text>
        <Text style={s.permText}>Allow camera access to see jewellery on yourself in real time.</Text>
        <Button title="Open settings" onPress={() => Linking.openSettings()} style={s.permBtn} />
        <Button title="Go back" variant="glass" onPress={navigation.goBack} style={s.permBtn} />
      </Screen>
    );
  }

  return (
    <View style={s.root}>
      {permission === 'granted' && (
        <ARTryOnView
          ref={arRef}
          style={StyleSheet.absoluteFill}
          imageUrl={item.image_url}
          bodyPart={item.body_part}
          anchorX={item.anchor_x}
          anchorY={item.anchor_y}
          sizeScale={item.size_scale}
          band3d={!!item.band_3d && isBandPart(item.body_part)}
          bandInnerMm={bandInnerMm(item.body_part, item.band_size)}
          bandThickMm={bandThickMm(item.body_part, item.band_profile)}
          bandProfile={item.band_profile ?? 'dome'}
          cameraFacing={facing}
          watermark={SHOP_NAME}
          onTrackingChange={e => setTracking(e.nativeEvent.tracking)}
          onCapture={e => {
            setCapturing(false);
            const { uri, error } = e.nativeEvent;
            if (uri) setPhoto(uri);
            else Alert.alert('Could not take photo', error);
          }}
        />
      )}
      <Animated.View pointerEvents="none" style={[s.flash, { opacity: flash }]} />

      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
        <IconButton onMedia onPress={navigation.goBack}>
          <X color={WHITE} size={22} />
        </IconButton>
        <View style={s.partPill}>
          <Text style={s.partText}>{info.label}</Text>
        </View>
        <IconButton onMedia onPress={() => setFacing(f => (f === 'front' ? 'back' : 'front'))}>
          <SwitchCamera color={WHITE} size={22} />
        </IconButton>
      </View>

      <Animated.View pointerEvents="none" style={[s.hint, { opacity: hintOpacity }]}>
        {isHand ? <Hand color={WHITE} size={34} /> : <ScanFace color={WHITE} size={34} />}
        <Text style={s.hintText}>{info.hint}</Text>
      </Animated.View>

      <View style={[s.bottom, { paddingBottom: insets.bottom + space.md }]}>
        <View style={s.controls}>
          {!isPreview ? (
            <IconButton onMedia onPress={() => toggleWish(item.id)} style={s.sideBtn}>
              <Heart color={isWished(item.id) ? GOLD : WHITE} fill={isWished(item.id) ? GOLD : 'none'} size={22} />
            </IconButton>
          ) : (
            <View style={s.sideBtn} />
          )}
          <PressableScale onPress={snap} scaleTo={0.9} style={s.shutterRing}>
            <View style={s.shutter}>
              <GoldFill />
              {capturing && <ActivityIndicator color={WHITE} />}
            </View>
          </PressableScale>
          {!isPreview && full ? (
            <IconButton onMedia onPress={() => enquireOnWhatsApp(full, price, settings)} style={s.sideBtn}>
              <MessageCircle color={WHITE} size={22} />
            </IconButton>
          ) : (
            <View style={s.sideBtn} />
          )}
        </View>

        <View style={s.infoCard}>
          <Text numberOfLines={1} style={s.itemName}>
            {item.name}
          </Text>
          <Text style={s.itemPrice}>{formatPrice(price, CURRENCY)}</Text>
        </View>

        {items.length > 1 && (
          <FlatList
            horizontal
            data={items}
            keyExtractor={j => j.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.carousel}
            renderItem={({ item: j, index: i }) => (
              <PressableScale
                onPress={() => setIndex(i)}
                scaleTo={0.9}
                style={[s.thumb, i === index && s.thumbActive]}>
                <Image source={{ uri: j.image_url }} style={s.thumbImg} resizeMode="contain" />
              </PressableScale>
            )}
          />
        )}
      </View>

      {/* captured photo preview */}
      <Modal visible={!!photo} animationType="fade" transparent onRequestClose={() => setPhoto(null)}>
        <Screen style={[s.previewRoot, { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.md }]}>
          {photo && <Image source={{ uri: photo }} style={s.previewImg} resizeMode="contain" />}
          <View style={s.previewActions}>
            <Button
              title="Share"
              icon={<Share2 color={c.onPrimary} size={18} />}
              onPress={share}
              loading={busy === 'share'}
              style={s.flex}
            />
            <Button
              title="Save"
              variant="glass"
              icon={<Download color={c.text} size={18} />}
              onPress={save}
              loading={busy === 'save'}
              style={s.flex}
            />
          </View>
          <View style={s.previewActions}>
            {!isPreview && full && (
              <Button
                title="Enquire"
                variant="glass"
                icon={<MessageCircle color={c.text} size={18} />}
                onPress={() => enquireOnWhatsApp(full, price, settings)}
                style={s.flex}
              />
            )}
            <Button
              title="Retake"
              variant="glass"
              icon={<RotateCcw color={c.text} size={18} />}
              onPress={() => setPhoto(null)}
              style={s.flex}
            />
          </View>
        </Screen>
      </Modal>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    flex: { flex: 1 },
    root: { flex: 1, backgroundColor: '#000' },
    flash: { ...StyleSheet.absoluteFill, backgroundColor: WHITE },
    topBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      paddingHorizontal: space.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    partPill: {
      backgroundColor: MEDIA_GLASS,
      borderWidth: 1,
      borderColor: MEDIA_BORDER,
      paddingHorizontal: 18,
      paddingVertical: 9,
      borderRadius: radius.pill,
    },
    partText: { color: WHITE, fontWeight: '700', letterSpacing: 0.4 },
    hint: {
      position: 'absolute',
      alignSelf: 'center',
      top: '36%',
      alignItems: 'center',
      backgroundColor: MEDIA_GLASS,
      borderWidth: 1,
      borderColor: MEDIA_BORDER,
      paddingVertical: 20,
      paddingHorizontal: 26,
      borderRadius: radius.lg,
      gap: 10,
    },
    hintText: { color: WHITE, fontSize: 15, fontWeight: '600' },
    bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
    controls: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 34,
      marginBottom: space.md,
    },
    sideBtn: { width: 52, height: 52, borderRadius: 26 },
    shutterRing: {
      width: 82,
      height: 82,
      borderRadius: 41,
      borderWidth: 4,
      borderColor: 'rgba(255,255,255,0.9)',
      padding: 5,
    },
    shutter: {
      flex: 1,
      borderRadius: 40,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    infoCard: {
      marginHorizontal: space.md,
      marginBottom: space.md,
      paddingVertical: 14,
      paddingHorizontal: 20,
      borderRadius: radius.lg,
      backgroundColor: MEDIA_GLASS,
      borderWidth: 1,
      borderColor: MEDIA_BORDER,
    },
    itemName: { fontFamily: serif, fontSize: 21, color: WHITE, fontWeight: '700' },
    itemPrice: { fontSize: 15, color: GOLD, fontWeight: '700', marginTop: 2 },
    carousel: { paddingHorizontal: space.md, gap: 12 },
    thumb: {
      width: 70,
      height: 70,
      borderRadius: 35,
      backgroundColor: 'rgba(255,255,255,0.85)',
      padding: 10,
      borderWidth: 3,
      borderColor: 'transparent',
    },
    thumbActive: { borderColor: c.primary },
    thumbImg: { width: '100%', height: '100%' },
    previewRoot: { paddingHorizontal: space.md, gap: space.sm },
    previewImg: { flex: 1, borderRadius: radius.lg, marginBottom: space.sm },
    previewActions: { flexDirection: 'row', gap: space.sm },
    permRoot: { alignItems: 'center', justifyContent: 'center', padding: space.xl },
    permTitle: { fontSize: 26, color: c.text, fontWeight: '800', textAlign: 'center' },
    permText: { color: c.textMuted, textAlign: 'center', marginTop: 10, fontSize: 15 },
    permBtn: { marginTop: space.md, alignSelf: 'stretch' },
  });
