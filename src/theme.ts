/** Glassmorphism design tokens for light & dark mode - luxury jewellery palette. */
import { Platform } from 'react-native';

/** Elegant serif for brand name, titles and product names. */
export const serif = Platform.select({ android: 'serif', ios: 'Georgia', default: undefined });

export type Palette = {
  isDark: boolean;
  bg: [string, string]; // base gradient
  blobs: [string, string, string, string]; // glowing colour blobs behind the glass
  blobOpacity: number;
  glass: string; // frosted card fill
  glassStrong: string; // more opaque glass (tab bar, inputs on focus)
  glassBorder: string; // bright 1px edge that sells the glass effect
  sheen: number; // top highlight strength
  text: string;
  textMuted: string;
  primary: string;
  primaryGradient: [string, string]; // polished-gold fill for buttons & active states
  primarySoft: string;
  onPrimary: string;
  price: string;
  danger: string;
  input: string;
  placeholder: string;
  overlay: string;
  statusBar: 'light-content' | 'dark-content';
};

// Ivory & champagne with gold, rose-gold and blush light behind the glass.
export const lightPalette: Palette = {
  isDark: false,
  bg: ['#FBF6EC', '#F1E6D2'],
  blobs: ['#E9B95C', '#E8A08C', '#F4D9A0', '#EDBFC4'],
  blobOpacity: 0.6,
  glass: 'rgba(255,252,245,0.45)',
  glassStrong: 'rgba(255,252,245,0.74)',
  glassBorder: 'rgba(255,255,255,0.92)',
  sheen: 0.55,
  text: '#2B2016',
  textMuted: '#7D6B57',
  primary: '#B07D2A',
  primaryGradient: ['#E2B85C', '#A8741F'],
  primarySoft: 'rgba(176,125,42,0.14)',
  onPrimary: '#FFFFFF',
  price: '#9A6A16',
  danger: '#B4232F',
  input: 'rgba(255,252,245,0.6)',
  placeholder: '#A8967F',
  overlay: 'rgba(40,28,14,0.55)',
  statusBar: 'dark-content',
};

// Onyx with molten gold, rose-gold, amber and a touch of emerald glowing through.
export const darkPalette: Palette = {
  isDark: true,
  bg: ['#0C0A08', '#1D160E'],
  blobs: ['#C48A2C', '#A85A45', '#7A5416', '#0E5A48'],
  blobOpacity: 0.55,
  glass: 'rgba(255,236,200,0.06)',
  glassStrong: 'rgba(255,236,200,0.11)',
  glassBorder: 'rgba(255,220,160,0.2)',
  sheen: 0.1,
  text: '#FBF3E4',
  textMuted: '#BFAE93',
  primary: '#D9AD55',
  primaryGradient: ['#F2D58E', '#BD8A2F'],
  primarySoft: 'rgba(217,173,85,0.18)',
  onPrimary: '#1E1508',
  price: '#ECCB7E',
  danger: '#F08A8A',
  input: 'rgba(255,236,200,0.06)',
  placeholder: '#8E7F69',
  overlay: 'rgba(8,6,3,0.62)',
  statusBar: 'light-content',
};

export const radius = { sm: 14, md: 20, lg: 28, pill: 999 };

export const space = { xs: 6, sm: 10, md: 16, lg: 22, xl: 32 };

/** Height reserved at the bottom of tab screens for the floating tab bar. */
export const TAB_BAR_SPACE = 104;

export const formatPrice = (p: number | null, currency: string) =>
  p == null ? 'Price on request' : `${currency}${Number(p).toLocaleString('en-IN')}`;
