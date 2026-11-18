import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChartColumn, Coins, Gem, Images, LogOut, Pencil, Plus, ShieldCheck, Trash2, Users } from 'lucide-react-native';
import { CURRENCY, SHOP_NAME } from '../config';
import { priceOf } from '../lib/pricing';
import {
  claimFirstOwner,
  cleanupUnusedImages,
  deleteJewel,
  shopHasOwner,
  signUp,
  supabase,
} from '../lib/supabase';
import { useApp } from '../state';
import { useStyles, useTheme } from '../ThemeProvider';
import { formatPrice, Palette, radius, space, TAB_BAR_SPACE } from '../theme';
import { Jewel, partInfo } from '../types';
import {
  Button,
  Field,
  Glass,
  IconButton,
  Muted,
  PressableScale,
  Screen,
  ThemeToggle,
  Title,
} from '../components/ui';
import type { RootStackParams } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParams>;

export default function OwnerScreen() {
  const { session, isOwner, ownerChecked } = useApp();
  const { c } = useTheme();
  const s = useStyles(makeStyles);
  if (!session) return <Login />;
  if (!ownerChecked) {
    return (
      <Screen style={s.center}>
        <ActivityIndicator color={c.primary} />
      </Screen>
    );
  }
  if (!isOwner) return <NotOwner email={session.user.email ?? ''} />;
  return <Dashboard />;
}

function Login() {
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const s = useStyles(makeStyles);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const isSignUp = mode === 'signup';

  const submit = async () => {
    if (!email.trim() || !password) {
      return Alert.alert('Missing details', 'Enter your email and password.');
    }
    if (isSignUp) {
      if (password.length < 8) return Alert.alert('Weak password', 'Use at least 8 characters.');
      if (password !== confirm) return Alert.alert('Passwords differ', 'Both passwords must match.');
    }
    setBusy(true);
    try {
      if (isSignUp) {
        const { needsConfirmation } = await signUp(email, password);
        if (needsConfirmation) {
          Alert.alert('Confirm your email', 'We sent you a link. Open it, then sign in here.');
          setMode('signin');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (e: any) {
      Alert.alert(isSignUp ? 'Sign up failed' : 'Sign in failed', e?.message ?? 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.flex}>
        <ScrollView
          contentContainerStyle={[
            s.page,
            { paddingTop: insets.top + space.md, paddingBottom: TAB_BAR_SPACE + insets.bottom },
          ]}
          keyboardShouldPersistTaps="handled">
          <View style={s.topRow}>
            <View style={s.flex} />
            <ThemeToggle />
          </View>

          <Glass style={s.authCard}>
            <View style={s.logo}>
              <Gem color={c.onPrimary} size={28} />
            </View>
            <Title>{isSignUp ? 'Create account' : 'Welcome back'}</Title>
            <Muted style={s.subtitle}>
              {isSignUp
                ? `Create an account to manage ${SHOP_NAME}.`
                : `Sign in to add and manage jewellery for ${SHOP_NAME}.`}
            </Muted>

            <View style={s.segment}>
              {(['signin', 'signup'] as const).map(m => (
                <Pressable
                  key={m}
                  onPress={() => setMode(m)}
                  style={[s.segmentItem, mode === m && s.segmentActive]}>
                  <Text style={[s.segmentText, mode === m && s.segmentTextActive]}>
                    {m === 'signin' ? 'Sign in' : 'Sign up'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="owner@yourshop.com"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder={isSignUp ? 'At least 8 characters' : '••••••••'}
            />
            {isSignUp && (
              <Field
                label="Confirm password"
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
                placeholder="Type it again"
              />
            )}
            <Button
              title={isSignUp ? 'Create account' : 'Sign in'}
              onPress={submit}
              loading={busy}
              style={s.submit}
            />
          </Glass>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function NotOwner({ email }: { email: string }) {
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const s = useStyles(makeStyles);
  const { refreshOwner } = useApp();
  const [hasOwner, setHasOwner] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    shopHasOwner()
      .then(setHasOwner)
      .catch(() => setHasOwner(true));
  }, []);

  const claim = async () => {
    setBusy(true);
    try {
      const ok = await claimFirstOwner();
      if (!ok) {
        setHasOwner(true);
        Alert.alert('Already set up', 'This shop already has an owner.');
      }
      await refreshOwner();
    } catch (e: any) {
      Alert.alert('Could not set up shop', e?.message ?? 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  let body: React.ReactNode;
  if (hasOwner === null) {
    body = <ActivityIndicator color={c.primary} />;
  } else if (hasOwner) {
    body = (
      <>
        <Title>Waiting for approval</Title>
        <Muted style={s.subtitle}>
          You're signed in as {email}. Ask the shop owner to add this email in My Shop → Team.
        </Muted>
        <Button title="Check again" onPress={refreshOwner} style={s.gap} />
      </>
    );
  } else {
    body = (
      <>
        <Title>Set up your shop</Title>
        <Muted style={s.subtitle}>
          {SHOP_NAME} has no owner yet. Become the owner with {email} to start adding jewellery.
        </Muted>
        <Button title="Set up my shop" onPress={claim} loading={busy} style={s.gap} />
      </>
    );
  }

  return (
    <Screen>
      <View style={[s.page, { paddingTop: insets.top + space.md }]}>
        <View style={s.topRow}>
          <View style={s.flex} />
          <ThemeToggle />
        </View>
        <Glass style={s.authCard}>
          <View style={s.logo}>
            <ShieldCheck color={c.onPrimary} size={28} />
          </View>
          {body}
          <Button title="Sign out" variant="glass" onPress={() => supabase.auth.signOut()} />
        </Glass>
      </View>
    </Screen>
  );
}

function Dashboard() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const { c } = useTheme();
  const s = useStyles(makeStyles);
  const { items, refresh, loading, settings } = useApp();

  // Remove images left on the server by earlier deletes / replaced photos (quietly, once).
  useEffect(() => {
    cleanupUnusedImages()
      .then(n => n > 0 && console.log(`Removed ${n} unused image(s) from storage`))
      .catch(e => console.warn('Image cleanup:', e?.message));
  }, []);

  const confirmDelete = (j: Jewel) =>
    Alert.alert('Delete item?', `"${j.name}" and its photo will be removed from the shop.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteJewel(j);
          } catch (e: any) {
            Alert.alert('Could not delete', e.message);
          } finally {
            refresh();
          }
        },
      },
    ]);

  return (
    <Screen>
      <FlatList
        data={items}
        keyExtractor={j => j.id}
        onRefresh={refresh}
        refreshing={loading}
        contentContainerStyle={[
          s.list,
          { paddingTop: insets.top + space.md, paddingBottom: TAB_BAR_SPACE + insets.bottom + 70 },
        ]}
        ListHeaderComponent={
          <>
            <View style={s.dashHeader}>
              <View style={s.flex}>
                <Title>My Shop</Title>
                <Muted>{items.length} pieces in your catalogue</Muted>
              </View>
              <View style={s.headerBtns}>
                <ThemeToggle />
                <IconButton onPress={() => supabase.auth.signOut()}>
                  <LogOut color={c.text} size={20} />
                </IconButton>
              </View>
            </View>
            <View style={s.tiles}>
              <Tile
                Icon={Coins}
                title="Today's rate"
                sub={settings?.gold22 ? `22K ₹${Math.round(settings.gold22 * 10).toLocaleString('en-IN')}/10g` : 'Not set'}
                onPress={() => nav.navigate('Rates')}
              />
              <Tile Icon={ChartColumn} title="Insights" sub="Views & try-ons" onPress={() => nav.navigate('Insights')} />
              <Tile Icon={Users} title="Team" sub="Owners" onPress={() => nav.navigate('Team')} />
            </View>
            <Button
              title="Add many photos at once"
              variant="glass"
              icon={<Images color={c.primary} size={18} />}
              onPress={() => nav.navigate('BulkAdd')}
              style={s.bulkBtn}
            />
            <Muted style={s.bulkHint}>Or share photos from WhatsApp straight to JewelAR</Muted>
          </>
        }
        ListEmptyComponent={
          <Glass style={s.empty}>
            <Muted style={s.centerText}>No items yet. Tap + to photograph your first piece.</Muted>
          </Glass>
        }
        renderItem={({ item }) => (
          <PressableScale onPress={() => nav.navigate('Editor', { jewel: item })}>
            <Glass style={s.row}>
              <View style={s.rowImg}>
                <Image source={{ uri: item.image_url }} style={s.flex} resizeMode="contain" />
              </View>
              <View style={s.flex}>
                <Text numberOfLines={1} style={s.rowName}>
                  {item.name}
                </Text>
                <Text style={s.rowMeta}>
                  {partInfo(item.body_part).label} · {formatPrice(priceOf(item, settings), CURRENCY)}
                  {item.auto_price ? ' · auto' : ''}
                </Text>
              </View>
              <IconButton onPress={() => nav.navigate('Editor', { jewel: item })} style={s.rowBtn}>
                <Pencil color={c.text} size={17} />
              </IconButton>
              <IconButton onPress={() => confirmDelete(item)} style={s.rowBtn}>
                <Trash2 color={c.danger} size={17} />
              </IconButton>
            </Glass>
          </PressableScale>
        )}
      />
      <PressableScale
        onPress={() => nav.navigate('Editor', {})}
        scaleTo={0.92}
        style={[s.fab, { bottom: TAB_BAR_SPACE + insets.bottom }]}>
        <Plus color={c.onPrimary} size={28} />
      </PressableScale>
    </Screen>
  );
}

function Tile({
  Icon,
  title,
  sub,
  onPress,
}: {
  Icon: typeof Coins;
  title: string;
  sub: string;
  onPress: () => void;
}) {
  const { c } = useTheme();
  const s = useStyles(makeStyles);
  return (
    <PressableScale onPress={onPress} style={s.flex}>
      <Glass style={s.tile}>
        <View style={s.tileIcon}>
          <Icon color={c.primary} size={18} />
        </View>
        <Text style={s.tileTitle}>{title}</Text>
        <Text style={s.tileSub} numberOfLines={1}>
          {sub}
        </Text>
      </Glass>
    </PressableScale>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    flex: { flex: 1 },
    center: { alignItems: 'center', justifyContent: 'center' },
    centerText: { textAlign: 'center' },
    page: { flexGrow: 1, paddingHorizontal: space.md },
    topRow: { flexDirection: 'row', marginBottom: space.md },
    authCard: { padding: space.lg },
    logo: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: space.lg,
      shadowColor: c.primary,
      shadowOpacity: 0.5,
      shadowRadius: 14,
      elevation: 8,
    },
    subtitle: { marginTop: 6, marginBottom: space.lg },
    segment: {
      flexDirection: 'row',
      backgroundColor: c.input,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.glassBorder,
      padding: 4,
      marginBottom: space.lg,
    },
    segmentItem: { flex: 1, height: 42, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
    segmentActive: { backgroundColor: c.primary },
    segmentText: { fontWeight: '700', color: c.textMuted, fontSize: 15 },
    segmentTextActive: { color: c.onPrimary },
    submit: { marginTop: space.sm },
    gap: { marginBottom: space.sm },
    list: { paddingHorizontal: space.md },
    dashHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: space.lg },
    headerBtns: { flexDirection: 'row', gap: 8 },
    tiles: { flexDirection: 'row', gap: 8, marginBottom: space.md },
    bulkBtn: { marginBottom: 6 },
    bulkHint: { fontSize: 12, textAlign: 'center', marginBottom: space.lg },
    tile: { padding: 12, borderRadius: radius.md, gap: 2 },
    tileIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    tileTitle: { fontSize: 14, fontWeight: '800', color: c.text },
    tileSub: { fontSize: 11, color: c.textMuted },
    empty: { padding: space.xl },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: radius.md,
      padding: 10,
      marginBottom: space.sm,
      gap: 12,
    },
    rowImg: {
      width: 64,
      height: 64,
      borderRadius: radius.sm,
      backgroundColor: c.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.6)',
      padding: 6,
    },
    rowName: { fontSize: 16, fontWeight: '700', color: c.text },
    rowMeta: { fontSize: 13, color: c.textMuted, marginTop: 3 },
    rowBtn: { width: 38, height: 38 },
    fab: {
      position: 'absolute',
      right: space.lg,
      width: 62,
      height: 62,
      borderRadius: 31,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: c.primary,
      shadowOpacity: 0.55,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 10,
    },
  });
