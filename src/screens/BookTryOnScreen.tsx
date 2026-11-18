import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { launchCamera, launchImageLibrary, ImagePickerResponse } from 'react-native-image-picker';
import { BookOpen, Camera, Crop, ImagePlus, Save, Sparkles, X } from 'lucide-react-native';
import { removeBackground } from '../native';
import { ImageCropper } from '../components/ImageCropper';
import { useApp } from '../state';
import { useStyles, useTheme } from '../ThemeProvider';
import { Palette, radius, space } from '../theme';
import { BODY_PARTS, BodyPart, isBandPart, partInfo } from '../types';
import { Button, Chip, Glass, IconButton, Muted, Screen, ThemeToggle } from '../components/ui';
import type { ScreenProps, TryOnItem } from '../navigation';

const BOX_H = 380;

type Photo = { uri: string; width: number; height: number };
type Cut = { uri: string; width: number; height: number; mime: string };

/**
 * Try on a design straight from the shop's catalogue book (or any photo), without adding it first:
 * photograph the page, crop / zoom to one design, tap Try it on.
 */
export default function BookTryOnScreen({ navigation }: ScreenProps<'BookTryOn'>) {
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const s = useStyles(makeStyles);
  const { isOwner } = useApp();

  const [photo, setPhoto] = useState<Photo | null>(null); // the cropped design
  const [source, setSource] = useState<string | null>(null); // full photo, for cropping again
  const [cropping, setCropping] = useState<string | null>(null);
  const [part, setPart] = useState<BodyPart>('neck');
  const [busy, setBusy] = useState<string | null>(null);
  // Last cut-out, reused while the photo stays the same.
  const lastCut = useRef<{ key: string; cut: Cut } | null>(null);

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
    setSource(a.uri);
    setCropping(a.uri);
  };

  const onCropped = (crop: Photo) => {
    setCropping(null);
    setPhoto(crop);
    lastCut.current = null;
  };

  /** Removes the background from the cropped design (falls back to the plain crop). */
  const cutOut = async (): Promise<Cut | null> => {
    if (!photo) return null;
    const key = photo.uri;
    if (lastCut.current?.key === key) return lastCut.current.cut;
    setBusy('Cutting out the design…');
    try {
      let cut: Cut = { ...photo, mime: 'image/jpeg' };
      try {
        const r = await removeBackground(photo.uri);
        cut = { ...r, mime: 'image/png' };
      } catch {
        // Printed pages sometimes defeat background removal - the plain crop still works.
      }
      lastCut.current = { key, cut };
      return cut;
    } catch (e: any) {
      Alert.alert('Could not cut out', e?.message ?? '');
      return null;
    } finally {
      setBusy(null);
    }
  };

  const tryOn = async () => {
    const cut = await cutOut();
    if (!cut) return;
    const anchor = partInfo(part).defaultAnchor;
    const item: TryOnItem = {
      id: 'preview',
      name: 'Design from book',
      price: null,
      body_part: part,
      image_url: cut.uri,
      anchor_x: anchor.x,
      anchor_y: anchor.y,
      size_scale: 1,
      band_3d: isBandPart(part),
      band_size: part === 'finger' ? '16' : '2.6',
      band_profile: 'dome',
    };
    navigation.navigate('TryOn', { items: [item], index: 0 });
  };

  const saveToShop = async () => {
    const cut = await cutOut();
    if (cut) navigation.navigate('Editor', { draft: { ...cut, part } });
  };

  return (
    <Screen>
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <IconButton onPress={navigation.goBack}>
          <X color={c.text} size={22} />
        </IconButton>
        <Text style={s.headerTitle}>Try from book</Text>
        <ThemeToggle />
      </View>

      <ScrollView contentContainerStyle={s.content}>
        <Glass style={s.section}>
          <View style={s.box}>
            {photo ? (
              <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
            ) : (
              <View style={s.placeholder}>
                <View style={s.placeholderIcon}>
                  <BookOpen color={c.primary} size={34} />
                </View>
                <Text style={s.placeholderTitle}>Show any design on you</Text>
                <Muted style={s.placeholderText}>
                  Take a photo of a design in the catalogue book, or pick a photo from WhatsApp or the gallery.
                </Muted>
              </View>
            )}
            {busy && (
              <View style={s.processing}>
                <ActivityIndicator color="#FFFFFF" size="large" />
                <Text style={s.processingText}>{busy}</Text>
              </View>
            )}
          </View>
          {photo && source && (
            <Button
              title="Crop / zoom again"
              variant="glass"
              icon={<Crop color={c.text} size={18} />}
              onPress={() => setCropping(source)}
              style={s.row}
            />
          )}
          <View style={s.row}>
            <Button
              title={photo ? 'New photo' : 'Camera'}
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
        </Glass>

        {photo && (
          <Glass style={s.section}>
            <Text style={s.sectionTitle}>This design is</Text>
            <View style={s.chips}>
              {BODY_PARTS.map(p => (
                <Chip key={p.key} label={p.label} active={part === p.key} onPress={() => setPart(p.key)} />
              ))}
            </View>
          </Glass>
        )}
      </ScrollView>

      {photo && (
        <View style={[s.footer, { paddingBottom: insets.bottom + space.md }]}>
          {isOwner && (
            <Button
              title="Save to my shop"
              variant="glass"
              icon={<Save color={c.text} size={18} />}
              onPress={saveToShop}
              disabled={!!busy}
              style={s.flex}
            />
          )}
          <Button
            title="Try it on"
            icon={<Sparkles color={c.onPrimary} size={18} />}
            onPress={tryOn}
            disabled={!!busy}
            style={s.flex}
          />
        </View>
      )}
      <ImageCropper uri={cropping} onCancel={() => setCropping(null)} onDone={onCropped} />
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
    sectionTitle: { fontSize: 17, fontWeight: '800', color: c.text, marginBottom: space.md },
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
    placeholderTitle: { fontSize: 17, fontWeight: '800', color: c.text, marginTop: 14 },
    placeholderText: { textAlign: 'center', marginTop: 6 },
    processing: {
      ...StyleSheet.absoluteFill,
      backgroundColor: c.overlay,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    processingText: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
    row: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    footer: { position: 'absolute', left: space.lg, right: space.lg, bottom: 0, flexDirection: 'row', gap: space.sm },
  });
