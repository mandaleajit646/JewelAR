import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, UserMinus, UserPlus } from 'lucide-react-native';
import { addOwner, listOwners, Owner, removeOwner } from '../lib/supabase';
import { useApp } from '../state';
import { useStyles, useTheme } from '../ThemeProvider';
import { Palette, radius, space } from '../theme';
import { Button, Field, Glass, IconButton, Muted, Screen, ThemeToggle } from '../components/ui';
import type { ScreenProps } from '../navigation';

export default function TeamScreen({ navigation }: ScreenProps<'Team'>) {
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const s = useStyles(makeStyles);
  const { session } = useApp();
  const myId = session?.user.id;
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setOwners(await listOwners());
    } catch (e: any) {
      Alert.alert('Could not load team', e?.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!email.trim()) return;
    setAdding(true);
    try {
      await addOwner(email);
      setEmail('');
      await load();
    } catch (e: any) {
      Alert.alert('Could not add owner', e?.message ?? 'Unknown error');
    } finally {
      setAdding(false);
    }
  };

  const confirmRemove = (o: Owner) =>
    Alert.alert('Remove owner?', `${o.email} will no longer be able to manage the shop.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeOwner(o.user_id);
            await load();
          } catch (e: any) {
            Alert.alert('Could not remove', e?.message ?? 'Unknown error');
          }
        },
      },
    ]);

  return (
    <Screen>
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <IconButton onPress={navigation.goBack}>
          <ChevronLeft color={c.text} size={24} />
        </IconButton>
        <Text style={s.headerTitle}>Team</Text>
        <ThemeToggle />
      </View>

      <FlatList
        data={owners}
        keyExtractor={o => o.user_id}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + space.xl }]}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            <Glass style={s.addCard}>
              <Text style={s.cardTitle}>Add an owner</Text>
              <Muted style={s.cardText}>
                They must first create an account in this app (My Shop → Sign up). Then enter their
                email here.
              </Muted>
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="partner@yourshop.com"
              />
              <Button
                title="Add owner"
                icon={<UserPlus color={c.onPrimary} size={18} />}
                onPress={add}
                loading={adding}
                disabled={!email.trim()}
              />
            </Glass>
            <Text style={s.sectionLabel}>OWNERS</Text>
          </>
        }
        ListEmptyComponent={loading ? <ActivityIndicator color={c.primary} /> : undefined}
        renderItem={({ item }) => (
          <Glass style={s.row}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{item.email.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={s.flex}>
              <Text numberOfLines={1} style={s.email}>
                {item.email}
              </Text>
              {item.user_id === myId && <Text style={s.you}>You</Text>}
            </View>
            {item.user_id !== myId && (
              <IconButton onPress={() => confirmRemove(item)} style={s.removeBtn}>
                <UserMinus color={c.danger} size={18} />
              </IconButton>
            )}
          </Glass>
        )}
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
    content: { padding: space.md },
    addCard: { padding: space.lg },
    cardTitle: { fontSize: 18, fontWeight: '800', color: c.text },
    cardText: { marginTop: 4, marginBottom: space.md },
    sectionLabel: {
      marginTop: space.lg,
      marginBottom: space.sm,
      marginLeft: 6,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 1.5,
      color: c.textMuted,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: radius.md,
      padding: 12,
      marginBottom: space.sm,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: c.onPrimary, fontWeight: '800', fontSize: 17 },
    email: { fontSize: 15, fontWeight: '700', color: c.text },
    you: { fontSize: 12, color: c.primary, fontWeight: '700', marginTop: 2 },
    removeBtn: { width: 38, height: 38 },
  });
