import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';
import type { EventKind, Jewel, JewelInput, ShopSettings } from '../types';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

const BUCKET = 'jewellery';

export async function fetchJewellery(): Promise<Jewel[]> {
  const { data, error } = await supabase
    .from('jewellery')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Jewel[];
}

// ---- shop settings & rates ----

export async function fetchSettings(): Promise<ShopSettings | null> {
  const { data, error } = await supabase.from('shop_settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data as ShopSettings | null;
}

export async function saveSettings(patch: Partial<ShopSettings>) {
  const { error } = await supabase.from('shop_settings').update(patch).eq('id', 1);
  if (error) throw error;
}

// ---- analytics ----

/** Fire-and-forget event log; never blocks or breaks the UI. */
export function track(jewelId: string, kind: EventKind) {
  if (!jewelId || jewelId === 'preview') return;
  supabase
    .from('jewel_events')
    .insert({ jewel_id: jewelId, kind })
    .then(
      () => {},
      () => {},
    );
}

export type JewelStat = {
  jewel_id: string;
  name: string;
  image_url: string;
  views: number;
  tryons: number;
  enquiries: number;
  shares: number;
  wishlists: number;
};

export async function fetchStats(days: number): Promise<JewelStat[]> {
  const { data, error } = await supabase.rpc('jewel_stats', { days });
  if (error) throw error;
  return ((data ?? []) as any[]).map(r => ({
    ...r,
    views: Number(r.views),
    tryons: Number(r.tryons),
    enquiries: Number(r.enquiries),
    shares: Number(r.shares),
    wishlists: Number(r.wishlists),
  }));
}

// ---- accounts & owners ----

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
  if (error) throw error;
  // session is null when Supabase requires email confirmation
  return { needsConfirmation: !data.session };
}

export async function shopHasOwner(): Promise<boolean> {
  const { data, error } = await supabase.rpc('shop_has_owner');
  if (error) throw error;
  return data === true;
}

export async function claimFirstOwner(): Promise<boolean> {
  const { data, error } = await supabase.rpc('claim_first_owner');
  if (error) throw error;
  return data === true;
}

export type Owner = { user_id: string; email: string };

export async function listOwners(): Promise<Owner[]> {
  const { data, error } = await supabase.rpc('list_shop_owners');
  if (error) throw error;
  return (data ?? []) as Owner[];
}

export async function addOwner(email: string) {
  const { error } = await supabase.rpc('add_shop_owner', { owner_email: email });
  if (error) throw error;
}

export async function removeOwner(userId: string) {
  const { error } = await supabase.rpc('remove_shop_owner', { target: userId });
  if (error) throw error;
}

export async function isShopOwner(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_shop_owner');
  if (error) return false;
  return data === true;
}

/**
 * Uploads a local image (file:// or content://) and returns its storage path + public url.
 * Calls the Storage REST API directly: supabase-js upload() calls FormData.has(),
 * which React Native's FormData does not implement.
 */
export async function uploadImage(localUri: string, mime = 'image/png') {
  const ext = mime === 'image/png' ? 'png' : 'jpg';
  const path = `items/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { data: auth } = await supabase.auth.getSession();
  const token = auth.session?.access_token;
  if (!token) throw new Error('Please sign in again');

  const form = new FormData();
  form.append('cacheControl', '3600');
  form.append('file', { uri: localUri, name: `jewel.${ext}`, type: mime } as any);

  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'x-upsert': 'false' },
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? body.error ?? `Upload failed (${res.status})`);
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

export async function saveJewel(input: JewelInput, id?: string) {
  const query = id
    ? supabase.from('jewellery').update(input).eq('id', id)
    : supabase.from('jewellery').insert(input);
  const { error } = await query;
  if (error) {
    if (/band_/.test(error.message ?? '')) {
      throw new Error(
        '3D bangle/ring fields are missing in the database. Run supabase/04_3d_bands.sql in the Supabase SQL Editor, then save again.',
      );
    }
    throw error;
  }
}

const STORAGE_POLICY_HINT =
  'Images could not be removed from the server. Run supabase/05_storage_cleanup.sql in the Supabase SQL Editor.';

/** Removes images from storage. Returns how many were really deleted. */
async function removePaths(paths: string[]) {
  const list = paths.filter(Boolean);
  if (!list.length) return 0;
  const { data, error } = await supabase.storage.from(BUCKET).remove(list);
  if (error) throw error;
  // Storage reports success but deletes nothing when the owner cannot SELECT the files.
  if ((data?.length ?? 0) === 0) throw new Error(STORAGE_POLICY_HINT);
  return data!.length;
}

export async function removeImage(path: string) {
  return removePaths([path]);
}

/**
 * Deletes images in storage that no piece uses any more (left over from deleted pieces,
 * replaced photos or cancelled saves). Files younger than 15 minutes are kept, so an upload
 * that is about to be saved is never touched.
 */
export async function cleanupUnusedImages() {
  const { data: rows, error } = await supabase.from('jewellery').select('image_path');
  if (error) throw error;
  const used = new Set((rows ?? []).map(r => r.image_path as string));
  const cutoff = Date.now() - 15 * 60 * 1000;
  const unused: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data: files, error: e } = await supabase.storage
      .from(BUCKET)
      .list('items', { limit: 1000, offset });
    if (e) throw e;
    for (const f of files ?? []) {
      const path = `items/${f.name}`;
      const created = f.created_at ? Date.parse(f.created_at) : 0;
      if (f.id && !used.has(path) && created < cutoff) unused.push(path);
    }
    if (!files || files.length < 1000) break;
  }
  let removed = 0;
  for (let i = 0; i < unused.length; i += 100) removed += await removePaths(unused.slice(i, i + 100));
  return removed;
}

export async function deleteJewel(j: Jewel) {
  const { error } = await supabase.from('jewellery').delete().eq('id', j.id);
  if (error) throw error;
  await removeImage(j.image_path);
}
