import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { launchImageLibrary } from 'react-native-image-picker';
import { AlertCircle, Check, ImagePlus, X } from 'lucide-react-native';
import { removeBackground } from '../native';
import { Cropped, ImageCropper } from '../components/ImageCropper';
import { saveJewel, uploadImage } from '../lib/supabase';
import { useApp } from '../state';
import { useStyles, useTheme } from '../ThemeProvider';
import { Palette, radius, space } from '../theme';
import { BODY_PARTS, BodyPart, isBandPart, partInfo } from '../types';
import { Button, Chip, Field, Glass, IconButton, Muted, Screen, ThemeToggle } from '../components/ui';
import type { ScreenProps } from '../navigation';

type Status = 'ready' | 'working' | 'done' | 'error';
type Photo = { uri: string; mime: string; status: Status; error?: string; orig?: string };

/** Name for one piece, e.g. "Bangle 12". */
const SINGULAR: Record<BodyPart, string> = {
  ear: 'Earrings',
  nose: 'Nose pin',
  forehead: 'Maang tikka',
  neck: 'Necklace',
  finger: 'Ring',
  wrist: 'Bangle',
};

const COLS = 3;

/**
 * Add many designs in one go: photos shared from WhatsApp / Gallery, or picked here.
 * Only the category is needed; name, price and details can be filled in later.
 */
export default function BulkAddScreen({ route, navigation }: ScreenProps<'BulkAdd'>) {
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const s = useStyles(makeStyles);
  const { width } = useWindowDimensions();
  const { items, refresh, isOwner, ownerChecked } = useApp();

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [part, setPart] = useState<BodyPart>('wrist');
  const [name, setName] = useState('');
  const [cutBg, setCutBg] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const cancelled = useRef(false);
  const [cropping, setCropping] = useState<Photo | null>(null);

  // New photos arrive through the route params (share sheet) - add them to the list.
  const stamp = route.params?.stamp;
  useEffect(() => {
    const incoming = route.params?.images ?? [];
    if (!incoming.length) return;
    setPhotos(prev => {
      const have = new Set(prev.map(p => p.uri));
      return [...prev, ...incoming.filter(i => !have.has(i.uri)).map(i => ({ ...i, status: 'ready' as Status }))];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp]);

  useEffect(
    () => () => {
      cancelled.current = true;
    },
    [],
  );

  const pickMore = async () => {
    const res = await launchImageLibrary({ mediaType: 'photo', quality: 1, selectionLimit: 0 });
    const add = (res.assets ?? [])
      .filter(a => a.uri)
      .map(a => ({ uri: a.uri!, mime: a.type ?? 'image/jpeg', status: 'ready' as Status }));
    if (!add.length) return;
    setPhotos(prev => {
      const have = new Set(prev.map(p => p.uri));
      return [...prev, ...add.filter(a => !have.has(a.uri))];
    });
  };

  const onCropped = (cr: Cropped) => {
    const target = cropping;
    setCropping(null);
    if (!target) return;
    setPhotos(prev =>
      prev.map(p =>
        p.uri === target.uri
          ? { uri: cr.uri, mime: 'image/jpeg', status: 'ready', orig: p.orig ?? p.uri }
          : p,
      ),
    );
  };

  const removePhoto = (uri: string) => setPhotos(prev => prev.filter(p => p.uri !== uri));

  const setStatus = (uri: string, status: Status, error?: string) =>
    setPhotos(prev => prev.map(p => (p.uri === uri ? { ...p, status, error } : p)));

  const todo = photos.filter(p => p.status !== 'done');

  const saveAll = async () => {
    if (!todo.length) return;
    setBusy(true);
    setProgress(0);
    const base = name.trim() || SINGULAR[part];
    let n = items.filter(j => j.body_part === part).length;
    let added = 0;
    let failed = 0;
    for (const [i, p] of todo.entries()) {
      if (cancelled.current) return;
      setStatus(p.uri, 'working');
      try {
        let uri = p.uri;
        let mime = p.mime;
        if (cutBg) {
          try {
            uri = (await removeBackground(p.uri)).uri;
            mime = 'image/png';
          } catch {
            // Keep the original photo when the background can't be removed.
          }
        }
        const up = await uploadImage(uri, mime === 'image/png' ? 'image/png' : 'image/jpeg');
        n += 1;
        const anchor = partInfo(part).defaultAnchor;
        await saveJewel({
          name: `${base} ${n}`,
          description: '',
          price: null,
          metal: '',
          weight_g: null,
          body_part: part,
          image_url: up.url,
          image_path: up.path,
          anchor_x: anchor.x,
          anchor_y: anchor.y,
          size_scale: 1,
          purity: '22K',
          making_type: 'percent',
          making_value: 0,
          stone_value: 0,
          auto_price: false,
          ...(isBandPart(part)
            ? { band_3d: true, band_size: part === 'finger' ? '16' : '2.6', band_profile: 'dome' as const }
            : {}),
        });
        setStatus(p.uri, 'done');
        added += 1;
      } catch (e: any) {
        setStatus(p.uri, 'error', e?.message ?? 'Failed');
        failed += 1;
      }
      setProgress(i + 1);
    }
    if (cancelled.current) return;
    setBusy(false);
    refresh();
    if (!failed) {
      Alert.alert('Added to shop', `${added} design${added === 1 ? '' : 's'} added. Tap any piece in My Shop to add price or details.`);
      navigation.goBack();
    } else {
      Alert.alert(
        'Some photos failed',
        `${added} added, ${failed} failed. Check the internet and tap the button again to retry the failed ones.`,
      );
    }
  };

  const tile = (width - space.md * 2 - space.md * 2 - (COLS - 1) * 8) / COLS;
  const needsSignIn = ownerChecked && !isOwner;

  return (
    <Screen>
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <IconButton onPress={navigation.goBack}>
          <X color={c.text} size={22} />
        </IconButton>
        <Text style={s.headerTitle}>Add many designs</Text>
        <ThemeToggle />
      </View>

      <ScrollView contentContainerStyle={s.content}>
        {needsSignIn && (
          <Glass style={s.section}>
            <Text style={s.sectionTitle}>Sign in first</Text>
            <Muted style={s.gapSm}>
              Only the shop owner can add designs. Open My Shop, sign in, then come back here. Your photos stay
              ready.
            </Muted>
            <Button
              title="Open My Shop"
              variant="glass"
              style={s.gapMd}
              onPress={() => navigation.navigate('Tabs', { screen: 'Owner' } as never)}
            />
          </Glass>
        )}

        <Glass style={s.section}>
          <Text style={s.sectionTitle}>
            {photos.length} photo{photos.length === 1 ? '' : 's'}
          </Text>
          {!photos.length && (
            <Muted style={s.gapSm}>
              Tip: in WhatsApp, long-press the design photos, tap Share and choose JewelAR. They will show up here.
            </Muted>
          )}
          {photos.length > 0 && !busy && <Muted style={s.gapSm}>Tap a photo to crop or zoom it.</Muted>}
          <View style={[s.grid, s.gapMd]}>
            {photos.map(p => (
              <Pressable
                key={p.uri}
                disabled={busy || p.status === 'done'}
                onPress={() => setCropping(p)}
                style={[s.tile, { width: tile, height: tile }]}>
                <Image source={{ uri: p.uri }} style={s.flex} resizeMode="cover" />
                {p.status === 'working' && (
                  <View style={s.tileOverlay}>
                    <ActivityIndicator color="#FFFFFF" />
                  </View>
                )}
                {p.status === 'done' && (
                  <View style={[s.tileOverlay, s.doneOverlay]}>
                    <Check color="#FFFFFF" size={30} />
                  </View>
                )}
                {p.status === 'error' && (
                  <Pressable style={[s.tileOverlay, s.errorOverlay]} onPress={() => Alert.alert('Failed', p.error)}>
                    <AlertCircle color="#FFFFFF" size={26} />
                  </Pressable>
                )}
                {!busy && p.status !== 'done' && (
                  <Pressable onPress={() => removePhoto(p.uri)} style={s.tileX} hitSlop={8}>
                    <X color="#FFFFFF" size={14} />
                  </Pressable>
                )}
              </Pressable>
            ))}
            {!busy && (
              <Pressable onPress={pickMore} style={[s.tile, s.addTile, { width: tile, height: tile }]}>
                <ImagePlus color={c.primary} size={26} />
                <Text style={s.addText}>Gallery</Text>
              </Pressable>
            )}
          </View>
        </Glass>

        <Glass style={s.section}>
          <Text style={s.sectionTitle}>These designs are</Text>
          <View style={[s.chips, s.gapMd]}>
            {BODY_PARTS.map(p => (
              <Chip key={p.key} label={p.label} active={part === p.key} onPress={() => !busy && setPart(p.key)} />
            ))}
          </View>
          {isBandPart(part) && (
            <Muted style={s.gapSm}>
              Saved as 3D {part === 'finger' ? 'rings (size 16)' : 'bangles (size 2.6)'}. You can change the size of
              any piece later.
            </Muted>
          )}
          <View style={s.gapMd}>
            <Field
              label="Name (optional)"
              value={name}
              onChangeText={setName}
              editable={!busy}
              placeholder={`${SINGULAR[part]} → ${SINGULAR[part]} 1, ${SINGULAR[part]} 2…`}
            />
          </View>
          <View style={s.switchRow}>
            <View style={s.flex}>
              <Text style={s.switchTitle}>Remove background</Text>
              <Muted style={s.small}>Cuts out the jewellery from each photo</Muted>
            </View>
            <Switch
              value={cutBg}
              onValueChange={setCutBg}
              disabled={busy}
              trackColor={{ true: c.primary, false: c.input }}
              thumbColor="#FFFFFF"
            />
          </View>
        </Glass>
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + space.md }]}>
        <Button
          title={
            busy
              ? `Adding ${progress + 1} of ${todo.length}…`
              : todo.length
                ? `Add ${todo.length} design${todo.length === 1 ? '' : 's'} to shop`
                : 'Choose photos'
          }
          onPress={todo.length ? saveAll : pickMore}
          disabled={busy || needsSignIn}
        />
      </View>
      <ImageCropper
        uri={cropping ? cropping.orig ?? cropping.uri : null}
        onCancel={() => setCropping(null)}
        onDone={onCropped}
      />
    </Screen>
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
    sectionTitle: { fontSize: 17, fontWeight: '800', color: c.text },
    gapSm: { marginTop: space.sm },
    gapMd: { marginTop: space.md },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tile: { borderRadius: radius.sm, overflow: 'hidden', backgroundColor: c.input },
    tileOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    doneOverlay: { backgroundColor: 'rgba(30,140,70,0.55)' },
    errorOverlay: { backgroundColor: 'rgba(190,40,40,0.6)' },
    tileX: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    addTile: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: c.primary,
      backgroundColor: c.primarySoft,
    },
    addText: { color: c.primary, fontWeight: '700', fontSize: 12 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: space.md },
    switchTitle: { fontSize: 15, fontWeight: '700', color: c.text },
    small: { fontSize: 12, marginTop: 2 },
    footer: { position: 'absolute', left: space.lg, right: space.lg, bottom: 0 },
  });
