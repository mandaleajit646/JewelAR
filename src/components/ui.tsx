import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Moon, Sun } from 'lucide-react-native';
import { useStyles, useTheme } from '../ThemeProvider';
import { Palette, radius, serif, space } from '../theme';

// ---------- background ----------

/** Soft glowing colour blobs - the coloured light that shows through the glass. */
export function GlassBackground() {
  const { c } = useTheme();
  const { width: w, height: h } = useWindowDimensions();
  const blobs = [
    { x: w * 0.05, y: h * 0.1, r: w * 0.75 },
    { x: w * 1.0, y: h * 0.32, r: w * 0.7 },
    { x: w * 0.15, y: h * 0.72, r: w * 0.8 },
    { x: w * 0.95, y: h * 0.98, r: w * 0.65 },
  ];
  return (
    <Svg style={StyleSheet.absoluteFill} width={w} height={h} pointerEvents="none">
      <Defs>
        <LinearGradient id="base" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={c.bg[0]} />
          <Stop offset="1" stopColor={c.bg[1]} />
        </LinearGradient>
        {c.blobs.map((color, i) => (
          <RadialGradient key={i} id={`blob${i}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={c.blobOpacity} />
            <Stop offset="0.55" stopColor={color} stopOpacity={c.blobOpacity * 0.35} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        ))}
      </Defs>
      <Rect width="100%" height="100%" fill="url(#base)" />
      {blobs.map((b, i) => (
        <Circle key={i} cx={b.x} cy={b.y} r={b.r} fill={`url(#blob${i})`} />
      ))}
    </Svg>
  );
}

/** Full-screen container with the glowing background. */
export function Screen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.flex, style]}>
      <GlassBackground />
      {children}
    </View>
  );
}

// ---------- glass surfaces ----------

/** Frosted glass card: translucent fill, bright edge and a soft top sheen. */
export function Glass({
  children,
  style,
  strong,
  sheen = true,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  strong?: boolean;
  sheen?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View
      style={[
        styles.glass,
        { backgroundColor: strong ? c.glassStrong : c.glass, borderColor: c.glassBorder },
        style,
      ]}>
      {sheen && (
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <LinearGradient id="sheen" x1="0" y1="0" x2="0.35" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={c.sheen} />
              <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#sheen)" />
        </Svg>
      )}
      {children}
    </View>
  );
}

/** Polished-gold gradient fill. Place inside a view with overflow hidden + border radius. */
export function GoldFill() {
  const { c } = useTheme();
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={c.primaryGradient[0]} />
          <Stop offset="0.55" stopColor={c.primary} />
          <Stop offset="1" stopColor={c.primaryGradient[1]} />
        </LinearGradient>
        <LinearGradient id="goldShine" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.35} />
          <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#gold)" />
      <Rect width="100%" height="100%" fill="url(#goldShine)" />
    </Svg>
  );
}

/** Pressable that gently shrinks when touched. */
export function PressableScale({
  style,
  children,
  scaleTo = 0.97,
  ...rest
}: PressableProps & { style?: StyleProp<ViewStyle>; scaleTo?: number; children: React.ReactNode }) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) =>
    Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  return (
    <Pressable onPressIn={() => to(scaleTo)} onPressOut={() => to(1)} {...rest}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

// ---------- controls ----------

type ButtonProps = {
  title: string;
  onPress?: () => void;
  icon?: React.ReactNode;
  variant?: 'primary' | 'glass';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, onPress, icon, variant = 'primary', loading, disabled, style }: ButtonProps) {
  const { c } = useTheme();
  const s = useStyles(makeStyles);
  const isPrimary = variant === 'primary';
  const fg = isPrimary ? c.onPrimary : c.text;
  const content = loading ? (
    <ActivityIndicator color={fg} />
  ) : (
    <>
      {icon}
      <Text style={[s.buttonText, { color: fg }]}>{title}</Text>
    </>
  );
  return (
    // Layout styles (flex, margins, width) go on the outer view so the button really fills its slot.
    <View style={[{ opacity: disabled ? 0.5 : 1 }, style]}>
      <PressableScale onPress={onPress} disabled={disabled || loading}>
        {isPrimary ? (
          <View style={[s.button, s.primary]}>
            <View style={s.fillClip}>
              <GoldFill />
            </View>
            {content}
          </View>
        ) : (
          <Glass strong style={[s.button, s.glassButton]} sheen={false}>
            {content}
          </Glass>
        )}
      </PressableScale>
    </View>
  );
}

/** Round glass icon button. `onMedia` = always-dark glass for use over the camera. */
export function IconButton({
  children,
  onPress,
  onMedia,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  onMedia?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const s = useStyles(makeStyles);
  return (
    <PressableScale onPress={onPress} scaleTo={0.9}>
      {onMedia ? (
        <View style={[s.iconBtn, s.iconBtnMedia, style]}>{children}</View>
      ) : (
        <Glass strong sheen={false} style={[s.iconBtn, style]}>
          {children}
        </Glass>
      )}
    </PressableScale>
  );
}

export function ThemeToggle() {
  const { c, toggle } = useTheme();
  return (
    <IconButton onPress={toggle}>
      {c.isDark ? <Sun color={c.text} size={20} /> : <Moon color={c.text} size={20} />}
    </IconButton>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  const s = useStyles(makeStyles);
  return (
    <PressableScale onPress={onPress}>
      {active ? (
        <View style={[s.chip, s.chipActive]}>
          <GoldFill />
          <Text style={[s.chipText, s.chipTextActive]}>{label}</Text>
        </View>
      ) : (
        <Glass sheen={false} style={s.chip}>
          <Text style={s.chipText}>{label}</Text>
        </Glass>
      )}
    </PressableScale>
  );
}

export function Field({ label, style, ...rest }: TextInputProps & { label: string }) {
  const { c } = useTheme();
  const s = useStyles(makeStyles);
  return (
    <View style={s.fieldWrap}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={c.placeholder}
        style={[s.field, rest.multiline && s.fieldMulti, style]}
        {...rest}
      />
    </View>
  );
}

export function Title({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const s = useStyles(makeStyles);
  return <Text style={[s.title, style]}>{children}</Text>;
}

export function Muted({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const s = useStyles(makeStyles);
  return <Text style={[s.muted, style]}>{children}</Text>;
}

/** Pulsing glass placeholder for loading states. */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const v = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <Animated.View
      style={[{ backgroundColor: c.glassStrong, borderColor: c.glassBorder, borderWidth: 1, opacity: v }, style]}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  glass: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
});

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    button: {
      height: 56,
      borderRadius: radius.pill,
      paddingHorizontal: space.lg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    primary: {
      backgroundColor: c.primary,
      shadowColor: c.primary,
      shadowOpacity: 0.45,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    fillClip: { ...StyleSheet.absoluteFill, borderRadius: radius.pill, overflow: 'hidden' },
    glassButton: { borderRadius: radius.pill },
    buttonText: { fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
    iconBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconBtnMedia: {
      backgroundColor: 'rgba(20,14,6,0.42)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.22)',
    },
    chip: {
      paddingHorizontal: 18,
      height: 40,
      borderRadius: radius.pill,
      justifyContent: 'center',
    },
    chipActive: { backgroundColor: c.primary, overflow: 'hidden' },
    chipText: { color: c.text, fontWeight: '600', fontSize: 14 },
    chipTextActive: { color: c.onPrimary },
    fieldWrap: { marginBottom: space.md },
    fieldLabel: { fontSize: 13, fontWeight: '600', color: c.textMuted, marginBottom: 6, marginLeft: 6 },
    field: {
      height: 54,
      borderRadius: radius.md,
      backgroundColor: c.input,
      borderWidth: 1,
      borderColor: c.glassBorder,
      paddingHorizontal: 18,
      fontSize: 16,
      color: c.text,
    },
    fieldMulti: { height: 104, paddingTop: 14, textAlignVertical: 'top' },
    title: { fontFamily: serif, fontSize: 30, color: c.text, fontWeight: '700' },
    muted: { color: c.textMuted, fontSize: 14, lineHeight: 20 },
  });
