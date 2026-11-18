import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { launchCamera, launchImageLibrary, ImagePickerResponse } from 'react-native-image-picker';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';
import { Camera, Crop, ImagePlus, Minus, Plus, Sparkles, WandSparkles, X } from 'lucide-react-native';
import { removeBackground } from '../native';
import { Cropped, ImageCropper } from '../components/ImageCropper';
import { removeImage, saveJewel, uploadImage } from '../lib/supabase';
import { useApp } from '../state';
import { useStyles, useTheme } from '../ThemeProvider';
import { Palette, radius, space } from '../theme';
import {
  BAND_PROFILES,
  BANGLE_SIZES,
  BandProfile,
  bandInnerMm,
  BODY_PARTS,
  BodyPart,
  isBandPart,
  MakingType,
  partInfo,
  Purity,
  PURITIES,
  RING_SIZES,
} from '../types';

const BAND_PHOTO_TIP =
  'Lay the piece flat on a plain table. Hold the phone at table level and shoot from the side, so the band looks like a straight strip. Turn the best side (stone / design) toward the camera.';
import { breakdown } from '../lib/pricing';

const MAKING: { key: MakingType; label: string; field: string }[] = [
  { key: 'percent', label: '% of metal', field: 'Making %' },
  { key: 'per_gram', label: '₹ per gram', field: 'Making ₹/g' },
  { key: 'fixed', label: 'Fixed ₹', field: 'Making ₹' },
];
import { Button, Chip, Field, Glass, IconButton, Muted, Screen, ThemeToggle } from '../components/ui';
import type { ScreenProps } from '../navigation';

const BOX_H = 320;

type Img = { uri: string; w: number; h: number; mime: string; local: boolean };

export default function EditorScreen({ route, navigation }: ScreenProps<'Editor'>) {
  const existing = route.params.jewel;
  const draft = route.params.draft;
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const s = useStyles(makeStyles);
  const { refresh, settings } = useApp();

  const [img, setImg] = useState<Img | null>(
    existing
      ? { uri: existing.image_url, w: 1, h: 1, mime: 'image/png', local: false }
      : draft
        ? { uri: draft.uri, w: draft.width, h: draft.height, mime: draft.mime, local: true }
        : null,
  );
  const [original, setOriginal] = useState<Img | null>(null);
  const [rawUri, setRawUri] = useState<string | null>(draft?.uri ?? null); // uncropped photo
  const [cropping, setCropping] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [boxW, setBoxW] = useState(0);

  const [part, setPart] = useState<BodyPart>(existing?.body_part ?? draft?.part ?? 'ear');
  const [anchor, setAnchor] = useState(
    existing
      ? { x: existing.anchor_x, y: existing.anchor_y }
      : draft
        ? partInfo(draft.part).defaultAnchor
        : { x: 0.5, y: 0 },
  );
  const [scale, setScale] = useState(existing?.size_scale ?? 1);
  const [name, setName] = useState(existing?.name ?? '');
  const [price, setPrice] = useState(existing?.price != null ? String(existing.price) : '');
  const [metal, setMetal] = useState(existing?.metal ?? '');
  const [weight, setWeight] = useState(existing?.weight_g != null ? String(existing.weight_g) : '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [purity, setPurity] = useState<Purity>(existing?.purity ?? '22K');
  const [autoPrice, setAutoPrice] = useState(existing?.auto_price ?? false);
  const [makingType, setMakingType] = useState<MakingType>(existing?.making_type ?? 'percent');
  const [makingValue, setMakingValue] = useState(existing?.making_value ? String(existing.making_value) : '');
  const [stoneValue, setStoneValue] = useState(existing?.stone_value ? String(existing.stone_value) : '');
  // 3D bands (bangles / kadas / rings)
  const [band3d, setBand3d] = useState(existing ? !!existing.band_3d : true);
  const [bandSize, setBandSize] = useState(
    existing?.band_size || ((existing?.body_part ?? draft?.part) === 'finger' ? '16' : '2.6'),
  );
  const [bandProfile, setBandProfile] = useState<BandProfile>(existing?.band_profile ?? 'dome');
  const isBand = isBandPart(part);
  const use3d = isBand && band3d;

  const pricing = {
    purity,
    weight_g: weight ? Number(weight) : null,
    making_type: makingType,
    making_value: Number(makingValue) || 0,
    stone_value: Number(stoneValue) || 0,
    auto_price: autoPrice,
    price: price ? Number(price) : null,
  };
  const live = breakdown(pricing, settings);

  // Real size of a remote image (needed to map taps to the anchor point).
  useEffect(() => {
    if (existing && img && !img.local && img.w === 1) {
      Image.getSize(img.uri, (w, h) => setImg(i => (i ? { ...i, w, h } : i)));
    }
  }, [existing, img]);

  const pick = async (from: 'camera' | 'library') => {
    let res: ImagePickerResponse;
    if (from === 'camera') {
      if (Platform.OS === 'android') {
        const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
        if (r !== PermissionsAndroid.RESULTS.GRANTED) return;
      }
      res = await launchCamera({ mediaType: 'photo', quality: 1, saveToPhotos: false });
    } else {
      res = await launchImageLibrary({ mediaType: 'photo', quality: 1, selectionLimit: 1 });
    }
    const a = res.assets?.[0];
    if (!a?.uri) return;
    setRawUri(a.uri);
    setCropping(a.uri);
  };

  const onCropped = async (cr: Cropped) => {
    setCropping(null);
    const picked: Img = { uri: cr.uri, w: cr.width, h: cr.height, mime: 'image/jpeg', local: true };
    setOriginal(picked);
    await cutOut(picked);
  };

  const cutOut = async (source: Img) => {
    setProcessing(true);
    try {
      const r = await removeBackground(source.uri);
      setImg({ uri: r.uri, w: r.width, h: r.height, mime: 'image/png', local: true });
      if (!existing) setAnchor(partInfo(part).defaultAnchor);
    } catch (e: any) {
      setImg(source);
      Alert.alert(
        'Could not remove background',
        `${e?.message ?? ''}\n\nThe original photo will be used. Try a plain background and good light for best results.`,
      );
    } finally {
      setProcessing(false);
    }
  };

  const choosePart = (p: BodyPart) => {
    setPart(p);
    if (!existing) setAnchor(partInfo(p).defaultAnchor);
    if (p === 'finger' && !RING_SIZES.includes(bandSize)) setBandSize('16');
    if (p === 'wrist' && !BANGLE_SIZES.includes(bandSize)) setBandSize('2.6');
  };

  // Rect where the image is drawn inside the box (resizeMode="contain").
  const drawn = (() => {
    if (!img || !boxW) return null;
    const k = Math.min(boxW / img.w, BOX_H / img.h);
    const w = img.w * k;
    const h = img.h * k;
    return { x: (boxW - w) / 2, y: (BOX_H - h) / 2, w, h };
  })();

  const onTapImage = (lx: number, ly: number) => {
    if (!drawn) return;
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    setAnchor({ x: clamp((lx - drawn.x) / drawn.w), y: clamp((ly - drawn.y) / drawn.h) });
  };

  const previewItem = () => ({
    id: 'preview',
    name: name || 'Preview',
    price: price ? Number(price) : null,
    body_part: part,
    image_url: img!.uri,
    anchor_x: anchor.x,
    anchor_y: anchor.y,
    size_scale: scale,
    band_3d: use3d,
    band_size: bandSize,
    band_profile: bandProfile,
  });

  const save = async () => {
    if (!img) return Alert.alert('Add a photo', 'Take or choose a photo of the jewellery first.');
    if (!name.trim()) return Alert.alert('Add a name', 'Give this piece a name.');
    if (autoPrice && !pricing.weight_g) {
      return Alert.alert('Add weight', 'Automatic price needs the weight in grams.');
    }
    setSaving(true);
    try {
      let image_url = existing?.image_url ?? '';
      let image_path = existing?.image_path ?? '';
      if (img.local) {
        const up = await uploadImage(img.uri, img.mime);
        image_url = up.url;
        image_path = up.path;
      }
      await saveJewel(
        {
          name: name.trim(),
          description: description.trim(),
          price: price ? Number(price) : null,
          metal: metal.trim(),
          weight_g: weight ? Number(weight) : null,
          body_part: part,
          image_url,
          image_path,
          anchor_x: anchor.x,
          anchor_y: anchor.y,
          size_scale: scale,
          purity,
          making_type: makingType,
          making_value: pricing.making_value,
          stone_value: pricing.stone_value,
          auto_price: autoPrice,
          // Only send the 3D fields for bands, so other pieces save even before 04_3d_bands.sql is run.
          ...(isBand ? { band_3d: band3d, band_size: bandSize, band_profile: bandProfile } : {}),
        },
        existing?.id,
      );
      if (existing && img.local) removeImage(existing.image_path).catch(() => {});
      await refresh();
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[s.header, { paddingTop: insets.top + 8 }]}>
          <IconButton onPress={navigation.goBack}>
            <X color={c.text} size={22} />
          </IconButton>
          <Text style={s.headerTitle}>{existing ? 'Edit piece' : 'New piece'}</Text>
          <ThemeToggle />
        </View>

        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          {/* 1. Photo */}
          <Glass style={s.section}>
            <Step n={1} title="Photo" />
            <View style={s.box} onLayout={e => setBoxW(e.nativeEvent.layout.width)}>
              {img ? (
                <Pressable
                  style={StyleSheet.absoluteFill}
                  onPress={e => onTapImage(e.nativeEvent.locationX, e.nativeEvent.locationY)}>
                  <Checkerboard dark={c.isDark} />
                  <Image source={{ uri: img.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
                  {drawn && !use3d && (
                    <View
                      pointerEvents="none"
                      style={[
                        s.anchor,
                        { left: drawn.x + anchor.x * drawn.w - 14, top: drawn.y + anchor.y * drawn.h - 14 },
                      ]}>
                      <View style={s.anchorDot} />
                    </View>
                  )}
                </Pressable>
              ) : (
                <View style={s.placeholder}>
                  <View style={s.placeholderIcon}>
                    <ImagePlus color={c.primary} size={34} />
                  </View>
                  <Muted style={s.placeholderText}>
                    {use3d ? BAND_PHOTO_TIP : 'Photograph the piece from the front on a plain background'}
                  </Muted>
                </View>
              )}
              {processing && (
                <View style={s.processing}>
                  <ActivityIndicator color="#FFFFFF" size="large" />
                  <Text style={s.processingText}>Removing background…</Text>
                </View>
              )}
            </View>

            <View style={s.row}>
              <Button
                title="Camera"
                variant="glass"
                icon={<Camera color={c.text} size={18} />}
                onPress={() => pick('camera')}
                style={s.flex}
              />
              <Button
                title="Gallery"
                variant="glass"
                icon={<ImagePlus color={c.text} size={18} />}
                onPress={() => pick('library')}
                style={s.flex}
              />
            </View>
            {rawUri && img?.local && !processing && (
              <Pressable onPress={() => setCropping(rawUri)} style={[s.link, s.linkRow]}>
                <Crop color={c.primary} size={16} />
                <Text style={s.linkText}>Crop / zoom photo</Text>
              </Pressable>
            )}
            {original && img?.uri !== original.uri && (
              <Pressable onPress={() => setImg(original)} style={s.link}>
                <Text style={s.linkText}>Background looks wrong? Use original photo</Text>
              </Pressable>
            )}
            {original && img?.uri === original.uri && (
              <Pressable onPress={() => cutOut(original)} style={[s.link, s.linkRow]}>
                <WandSparkles color={c.primary} size={16} />
                <Text style={s.linkText}>Try removing background again</Text>
              </Pressable>
            )}
          </Glass>

          {/* 2. Body part */}
          <Glass style={s.section}>
            <Step n={2} title="Worn on" />
            <View style={s.chips}>
              {BODY_PARTS.map(p => (
                <Chip key={p.key} label={p.label} active={part === p.key} onPress={() => choosePart(p.key)} />
              ))}
            </View>
          </Glass>

          {/* 3. Fit */}
          <Glass style={s.section}>
            <Step n={3} title="Fit" />
            {isBand && (
              <>
                <Text style={s.label}>Try-on style</Text>
                <View style={s.chips}>
                  <Chip label="3D wrap (recommended)" active={band3d} onPress={() => setBand3d(true)} />
                  <Chip label="Flat photo" active={!band3d} onPress={() => setBand3d(false)} />
                </View>
              </>
            )}
            {use3d ? (
              <>
                <Text style={[s.label, s.labelGap]}>{part === 'finger' ? 'Ring size' : 'Bangle size'}</Text>
                <View style={s.chips}>
                  {(part === 'finger' ? RING_SIZES : BANGLE_SIZES).map(z => (
                    <Chip key={z} label={z} active={bandSize === z} onPress={() => setBandSize(z)} />
                  ))}
                </View>
                <Muted style={s.hint}>
                  Inner diameter {bandInnerMm(part, bandSize).toFixed(1)} mm
                </Muted>
                <Text style={[s.label, s.labelGap]}>Band shape</Text>
                <View style={s.chips}>
                  {BAND_PROFILES.map(p => (
                    <Chip
                      key={p.key}
                      label={p.label}
                      active={bandProfile === p.key}
                      onPress={() => setBandProfile(p.key)}
                    />
                  ))}
                </View>
                <View style={[s.pricePreview, s.labelGap]}>
                  <Text style={s.previewLabel}>PHOTO FOR 3D</Text>
                  <Muted style={s.previewSub}>{BAND_PHOTO_TIP}</Muted>
                </View>
              </>
            ) : (
              <Muted style={isBand ? s.labelGap : undefined}>
                Tap the photo where the piece attaches to the body — e.g. the earring hook or the top of
                a necklace. The dot marks it.
              </Muted>
            )}
            <View style={s.sizeRow}>
              <Text style={s.sizeLabel}>Size</Text>
              <IconButton onPress={() => setScale(v => Math.max(0.4, +(v - 0.1).toFixed(1)))}>
                <Minus color={c.text} size={18} />
              </IconButton>
              <Text style={s.sizeValue}>{scale.toFixed(1)}×</Text>
              <IconButton onPress={() => setScale(v => Math.min(3, +(v + 0.1).toFixed(1)))}>
                <Plus color={c.text} size={18} />
              </IconButton>
            </View>
            <Button
              title="Preview on me"
              variant="glass"
              icon={<Sparkles color={c.primary} size={18} />}
              disabled={!img || processing}
              onPress={() => navigation.navigate('TryOn', { items: [previewItem()], index: 0 })}
            />
          </Glass>

          {/* 4. Details */}
          <Glass style={s.section}>
            <Step n={4} title="Details" />
            <Field label="Name" value={name} onChangeText={setName} placeholder="Kundan jhumka" />
            <Field
              label="Weight (g)"
              value={weight}
              onChangeText={setWeight}
              keyboardType="decimal-pad"
              placeholder="8.5"
            />
            <Field label="Metal / finish" value={metal} onChangeText={setMetal} placeholder="Yellow gold, kundan" />
            <Field
              label="Description"
              value={description}
              onChangeText={setDescription}
              multiline
              placeholder="Handcrafted kundan work with pearl drops…"
            />
          </Glass>

          {/* 5. Pricing */}
          <Glass style={s.section}>
            <Step n={5} title="Pricing" />
            <Text style={s.label}>Purity</Text>
            <View style={s.chips}>
              {PURITIES.map(p => (
                <Chip key={p.key} label={p.label} active={purity === p.key} onPress={() => setPurity(p.key)} />
              ))}
            </View>

            <Text style={[s.label, s.labelGap]}>Price type</Text>
            <View style={s.chips}>
              <Chip label="Fixed price" active={!autoPrice} onPress={() => setAutoPrice(false)} />
              <Chip
                label="Auto from today's rate"
                active={autoPrice}
                onPress={() => setAutoPrice(true)}
              />
            </View>

            {!autoPrice ? (
              <View style={s.labelGap}>
                <Field label="Price (₹)" value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="24999" />
              </View>
            ) : (
              <View style={s.labelGap}>
                <Text style={s.label}>Making charges</Text>
                <View style={s.chips}>
                  {MAKING.map(m => (
                    <Chip key={m.key} label={m.label} active={makingType === m.key} onPress={() => setMakingType(m.key)} />
                  ))}
                </View>
                <View style={[s.row, s.labelGap]}>
                  <View style={s.flex}>
                    <Field
                      label={MAKING.find(m => m.key === makingType)!.field}
                      value={makingValue}
                      onChangeText={setMakingValue}
                      keyboardType="decimal-pad"
                      placeholder={makingType === 'percent' ? '12' : '500'}
                    />
                  </View>
                  <View style={s.flex}>
                    <Field
                      label="Stones (₹)"
                      value={stoneValue}
                      onChangeText={setStoneValue}
                      keyboardType="numeric"
                      placeholder="0"
                    />
                  </View>
                </View>
                <View style={s.pricePreview}>
                  {live ? (
                    <>
                      <Text style={s.previewLabel}>Price today (incl. {settings?.gst_percent ?? 0}% GST)</Text>
                      <Text style={s.previewValue}>₹{live.total.toLocaleString('en-IN')}</Text>
                      <Muted style={s.previewSub}>
                        Metal ₹{live.metal.toLocaleString('en-IN')} + making ₹{live.making.toLocaleString('en-IN')}
                        {live.stones ? ` + stones ₹${live.stones.toLocaleString('en-IN')}` : ''} + GST ₹
                        {live.gst.toLocaleString('en-IN')}
                      </Muted>
                    </>
                  ) : (
                    <Muted>
                      {purity === 'other'
                        ? 'Auto price needs a gold or silver purity.'
                        : !pricing.weight_g
                          ? 'Enter the weight above to see the price.'
                          : "Publish today's rate first (My Shop → Today's rate)."}
                    </Muted>
                  )}
                </View>
              </View>
            )}
          </Glass>
        </ScrollView>

        <View style={[s.footer, { paddingBottom: insets.bottom + space.md }]}>
          <Button title={existing ? 'Save changes' : 'Add to shop'} onPress={save} loading={saving} />
        </View>
      </KeyboardAvoidingView>
      <ImageCropper uri={cropping} onCancel={() => setCropping(null)} onDone={onCropped} />
    </Screen>
  );
}

function Step({ n, title }: { n: number; title: string }) {
  const s = useStyles(makeStyles);
  return (
    <View style={s.step}>
      <View style={s.stepNum}>
        <Text style={s.stepNumText}>{n}</Text>
      </View>
      <Text style={s.stepTitle}>{title}</Text>
    </View>
  );
}

/** Checkerboard so transparent areas of the PNG are visible. */
function Checkerboard({ dark }: { dark: boolean }) {
  const a = dark ? '#1C160E' : '#FFFDF8';
  const b = dark ? '#2A2116' : '#F2EADC';
  return (
    <Svg style={StyleSheet.absoluteFill}>
      <Defs>
        <Pattern id="checker" width={20} height={20} patternUnits="userSpaceOnUse">
          <Rect width={20} height={20} fill={a} />
          <Rect width={10} height={10} fill={b} />
          <Rect x={10} y={10} width={10} height={10} fill={b} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#checker)" />
    </Svg>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    flex: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: space.md,
      paddingBottom: space.sm,
    },
    headerTitle: { fontSize: 20, color: c.text, fontWeight: '800', letterSpacing: -0.3 },
    content: { padding: space.md, paddingBottom: 140, gap: space.md },
    section: { padding: space.md },
    step: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: space.md },
    stepNum: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepNumText: { color: c.onPrimary, fontWeight: '800', fontSize: 13 },
    stepTitle: { fontSize: 17, fontWeight: '800', color: c.text },
    box: {
      height: BOX_H,
      borderRadius: radius.md,
      overflow: 'hidden',
      backgroundColor: c.input,
      borderWidth: 1,
      borderColor: c.glassBorder,
    },
    placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
    placeholderIcon: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    placeholderText: { textAlign: 'center', marginTop: 12 },
    processing: {
      ...StyleSheet.absoluteFill,
      backgroundColor: c.overlay,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    processingText: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
    anchor: {
      position: 'absolute',
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: c.primary,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    anchorDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.primary },
    row: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
    link: { alignSelf: 'center', paddingTop: 12 },
    linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    linkText: { color: c.primary, fontWeight: '700' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    label: { fontSize: 13, fontWeight: '700', color: c.textMuted, marginBottom: 8, marginLeft: 4 },
    labelGap: { marginTop: space.md },
    hint: { fontSize: 12, marginTop: 6, marginLeft: 4 },
    pricePreview: { backgroundColor: c.primarySoft, borderRadius: radius.md, padding: space.md },
    previewLabel: { color: c.textMuted, fontSize: 12, fontWeight: '700' },
    previewValue: { color: c.price, fontSize: 26, fontWeight: '800', marginTop: 2 },
    previewSub: { fontSize: 12, marginTop: 4 },
    sizeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: space.md },
    sizeLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: c.text },
    sizeValue: { fontSize: 17, fontWeight: '800', color: c.text, minWidth: 48, textAlign: 'center' },
    footer: { position: 'absolute', left: space.lg, right: space.lg, bottom: 0 },
  });
