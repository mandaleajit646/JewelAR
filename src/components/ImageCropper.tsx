import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  GestureResponderEvent,
  Image,
  LayoutChangeEvent,
  Modal,
  PanResponder,
  PanResponderGestureState,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, RotateCcw, X } from 'lucide-react-native';
import { cropImage } from '../native';
import { useTheme } from '../ThemeProvider';
import { radius, space } from '../theme';
import { Button, IconButton } from './ui';

export type Cropped = { uri: string; width: number; height: number };

type Box = { x: number; y: number; w: number; h: number }; // screen px inside the stage
type View2 = { z: number; tx: number; ty: number }; // zoom + pan of the photo

const MIN_SIDE = 48;
const MAX_ZOOM = 8;
const HANDLE = 34;

/**
 * Full-screen crop: pinch to zoom, drag to move the photo, drag the corners to size the box.
 * Gives back an upright JPEG of the area inside the box.
 */
export function ImageCropper({
  uri,
  onCancel,
  onDone,
}: {
  /** Photo to crop (content:// or file://). null hides the cropper. */
  uri: string | null;
  onCancel: () => void;
  onDone: (c: Cropped) => void;
}) {
  return (
    <Modal visible={!!uri} animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      {uri && <Cropper key={uri} uri={uri} onCancel={onCancel} onDone={onDone} />}
    </Modal>
  );
}

function Cropper({ uri, onCancel, onDone }: { uri: string; onCancel: () => void; onDone: (c: Cropped) => void }) {
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const [src, setSrc] = useState<Cropped | null>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View2>({ z: 1, tx: 0, ty: 0 });
  const [box, setBox] = useState<Box | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Upright copy first, so the box matches the saved pixels (camera photos carry EXIF rotation).
  useEffect(() => {
    cropImage(uri)
      .then(setSrc)
      .catch(e => setError(e?.message ?? 'Could not open photo'));
  }, [uri]);

  // Photo fitted inside the stage at zoom 1.
  const fit = useMemo(() => {
    if (!src || !stage.w) return null;
    const k = Math.min(stage.w / src.width, stage.h / src.height);
    const w = src.width * k;
    const h = src.height * k;
    return { x: (stage.w - w) / 2, y: (stage.h - h) / 2, w, h };
  }, [src, stage]);

  const reset = () => {
    setView({ z: 1, tx: 0, ty: 0 });
    if (fit) setBox({ x: fit.x + fit.w * 0.08, y: fit.y + fit.h * 0.08, w: fit.w * 0.84, h: fit.h * 0.84 });
  };
  useEffect(reset, [fit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Latest values for the gesture handlers (created once).
  const live = useRef({ view, box, stage, fit });
  live.current = { view, box, stage, fit };

  // ---- photo: one finger moves, two fingers zoom ----
  const g0 = useRef({ view, dist: 0, mid: { x: 0, y: 0 }, touches: 0, dx: 0, dy: 0 });
  const photoPan = useMemo(() => {
    const dist = (e: GestureResponderEvent) => {
      const [a, b] = e.nativeEvent.touches;
      return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
    };
    const mid = (e: GestureResponderEvent) => {
      const [a, b] = e.nativeEvent.touches;
      return { x: (a.pageX + b.pageX) / 2, y: (a.pageY + b.pageY) / 2 };
    };
    const begin = (e: GestureResponderEvent, g: PanResponderGestureState) => {
      const n = e.nativeEvent.touches.length;
      g0.current = {
        view: live.current.view,
        touches: n,
        dist: n >= 2 ? dist(e) : 0,
        mid: n >= 2 ? mid(e) : { x: 0, y: 0 },
        dx: g.dx,
        dy: g.dy,
      };
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: begin,
      onPanResponderMove: (e, g) => {
        const n = e.nativeEvent.touches.length;
        if (n !== g0.current.touches) return begin(e, g); // finger added / lifted: restart from here
        const s = g0.current;
        if (n >= 2 && s.dist > 0) {
          const z = Math.min(MAX_ZOOM, Math.max(1, (s.view.z * dist(e)) / s.dist));
          const m = mid(e);
          setView({ z, tx: s.view.tx + m.x - s.mid.x, ty: s.view.ty + m.y - s.mid.y });
        } else {
          setView({ ...s.view, tx: s.view.tx + g.dx - s.dx, ty: s.view.ty + g.dy - s.dy });
        }
      },
    });
  }, []);

  // ---- crop box corners ----
  const corner = (cx: 0 | 1, cy: 0 | 1) => {
    let start: Box | null = null;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        start = live.current.box;
      },
      onPanResponderMove: (_e, g) => {
        if (!start) return;
        const { w: W, h: H } = live.current.stage;
        let x0 = start.x;
        let y0 = start.y;
        let x1 = start.x + start.w;
        let y1 = start.y + start.h;
        if (cx === 0) x0 = Math.min(Math.max(0, start.x + g.dx), x1 - MIN_SIDE);
        else x1 = Math.max(Math.min(W, start.x + start.w + g.dx), x0 + MIN_SIDE);
        if (cy === 0) y0 = Math.min(Math.max(0, start.y + g.dy), y1 - MIN_SIDE);
        else y1 = Math.max(Math.min(H, start.y + start.h + g.dy), y0 + MIN_SIDE);
        setBox({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      },
    });
  };
  const corners = useMemo(
    () => [corner(0, 0), corner(1, 0), corner(0, 1), corner(1, 1)],
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  /** Box (stage px) -> 0..1 of the photo, undoing zoom and pan (zoom is about the stage centre). */
  const done = async () => {
    if (!src || !fit || !box) return;
    const cxs = stage.w / 2;
    const cys = stage.h / 2;
    const toU = (px: number) => ((cxs + (px - view.tx - cxs) / view.z) - fit.x) / fit.w;
    const toV = (py: number) => ((cys + (py - view.ty - cys) / view.z) - fit.y) / fit.h;
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    const l = clamp(toU(box.x));
    const r = clamp(toU(box.x + box.w));
    const t = clamp(toV(box.y));
    const b = clamp(toV(box.y + box.h));
    if (r - l < 0.01 || b - t < 0.01) {
      setError('The box is outside the photo. Tap reset and try again.');
      return;
    }
    setBusy(true);
    try {
      onDone(await cropImage(src.uri, l, t, r, b));
    } catch (e: any) {
      setError(e?.message ?? 'Could not crop');
      setBusy(false);
    }
  };

  const onLayout = (e: LayoutChangeEvent) =>
    setStage({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + space.md }]}>
      <View style={styles.header}>
        <IconButton onMedia onPress={onCancel}>
          <X color="#FFFFFF" size={22} />
        </IconButton>
        <Text style={styles.title}>Crop</Text>
        <IconButton onMedia onPress={reset}>
          <RotateCcw color="#FFFFFF" size={20} />
        </IconButton>
      </View>

      <View style={styles.stage} onLayout={onLayout}>
        {src && fit && (
          <View style={StyleSheet.absoluteFill} {...photoPan.panHandlers}>
            <Image
              source={{ uri: src.uri }}
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: fit.x,
                top: fit.y,
                width: fit.w,
                height: fit.h,
                transform: [{ translateX: view.tx }, { translateY: view.ty }, { scale: view.z }],
              }}
            />
          </View>
        )}
        {box && (
          <>
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <View style={[styles.dim, { top: 0, left: 0, right: 0, height: box.y }]} />
              <View style={[styles.dim, { top: box.y + box.h, left: 0, right: 0, bottom: 0 }]} />
              <View style={[styles.dim, { top: box.y, left: 0, width: box.x, height: box.h }]} />
              <View style={[styles.dim, { top: box.y, left: box.x + box.w, right: 0, height: box.h }]} />
              <View style={[styles.frame, { left: box.x, top: box.y, width: box.w, height: box.h, borderColor: c.primary }]}>
                <View style={[styles.gridV, { left: '33.3%' }]} />
                <View style={[styles.gridV, { left: '66.6%' }]} />
                <View style={[styles.gridH, { top: '33.3%' }]} />
                <View style={[styles.gridH, { top: '66.6%' }]} />
              </View>
            </View>
            {([
              [0, 0],
              [1, 0],
              [0, 1],
              [1, 1],
            ] as const).map(([cx, cy], i) => (
              <View
                key={i}
                {...corners[i].panHandlers}
                style={[
                  styles.handle,
                  { left: box.x + cx * box.w - HANDLE / 2, top: box.y + cy * box.h - HANDLE / 2 },
                ]}>
                <View style={[styles.handleDot, { backgroundColor: c.primary }]} />
              </View>
            ))}
          </>
        )}
        {(!src || busy) && !error && (
          <View style={styles.center} pointerEvents="none">
            <ActivityIndicator color="#FFFFFF" size="large" />
          </View>
        )}
      </View>

      <Text style={styles.hint}>
        {error ?? 'Pinch to zoom · drag to move · drag the corners to fit the design'}
      </Text>
      <Button
        title="Use this"
        icon={<Check color={c.onPrimary} size={18} />}
        onPress={done}
        disabled={!src || busy}
        style={styles.btn}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0906' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  stage: { flex: 1, overflow: 'hidden' },
  dim: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.6)' },
  frame: { position: 'absolute', borderWidth: 2, borderRadius: 4 },
  gridV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.35)' },
  gridH: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.35)' },
  handle: { position: 'absolute', width: HANDLE, height: HANDLE, alignItems: 'center', justifyContent: 'center' },
  handleDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#FFFFFF' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  hint: { color: 'rgba(255,255,255,0.75)', textAlign: 'center', fontSize: 13, marginVertical: space.sm },
  btn: { marginHorizontal: space.lg, borderRadius: radius.pill },
});
