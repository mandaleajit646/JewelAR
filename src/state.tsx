import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { fetchJewellery, fetchSettings, isShopOwner, supabase, track } from './lib/supabase';
import type { Jewel, ShopSettings } from './types';

type Ctx = {
  items: Jewel[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  settings: ShopSettings | null;
  refreshSettings: () => Promise<void>;
  session: Session | null;
  isOwner: boolean;
  ownerChecked: boolean;
  refreshOwner: () => Promise<void>;
  wishlist: string[];
  isWished: (id: string) => boolean;
  toggleWish: (id: string) => void;
};

const WISHLIST_KEY = 'jewelar.wishlist';
const AppContext = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Jewel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [ownerChecked, setOwnerChecked] = useState(false);
  const [wishlist, setWishlist] = useState<string[]>([]);

  const refreshSettings = useCallback(async () => {
    try {
      setSettings(await fetchSettings());
    } catch {
      // settings table may not exist yet - app still works with manual prices
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [list] = await Promise.all([fetchJewellery(), refreshSettings()]);
      setItems(list);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load jewellery');
    } finally {
      setLoading(false);
    }
  }, [refreshSettings]);

  useEffect(() => {
    refresh();
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    AsyncStorage.getItem(WISHLIST_KEY)
      .then(v => v && setWishlist(JSON.parse(v)))
      .catch(() => {});
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  const refreshOwner = useCallback(async () => {
    setIsOwner(session ? await isShopOwner() : false);
    setOwnerChecked(true);
  }, [session]);

  useEffect(() => {
    setOwnerChecked(false);
    refreshOwner();
  }, [refreshOwner]);

  const toggleWish = useCallback((id: string) => {
    setWishlist(prev => {
      const adding = !prev.includes(id);
      if (adding) track(id, 'wishlist');
      const next = adding ? [id, ...prev] : prev.filter(x => x !== id);
      AsyncStorage.setItem(WISHLIST_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const isWished = useCallback((id: string) => wishlist.includes(id), [wishlist]);

  return (
    <AppContext.Provider
      value={{
        items,
        loading,
        error,
        refresh,
        settings,
        refreshSettings,
        session,
        isOwner,
        ownerChecked,
        refreshOwner,
        wishlist,
        isWished,
        toggleWish,
      }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
}
