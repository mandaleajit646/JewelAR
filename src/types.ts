export type BodyPart = 'ear' | 'nose' | 'forehead' | 'neck' | 'finger' | 'wrist';
export type Purity = '24K' | '22K' | '18K' | 'silver' | 'other';
export type MakingType = 'percent' | 'per_gram' | 'fixed';
export type EventKind = 'view' | 'tryon' | 'enquiry' | 'share' | 'wishlist';

export const PURITIES: { key: Purity; label: string }[] = [
  { key: '22K', label: '22K Gold' },
  { key: '24K', label: '24K Gold' },
  { key: '18K', label: '18K Gold' },
  { key: 'silver', label: 'Silver' },
  { key: 'other', label: 'Other' },
];

export type ShopSettings = {
  whatsapp_number: string;
  gst_percent: number;
  rate_premium_percent: number;
  gold24: number | null;
  gold22: number | null;
  gold18: number | null;
  silver: number | null;
  rates_updated_at: string | null;
};

export type Jewel = {
  id: string;
  name: string;
  description: string;
  price: number | null;
  metal: string;
  weight_g: number | null;
  body_part: BodyPart;
  image_url: string;
  image_path: string;
  anchor_x: number;
  anchor_y: number;
  size_scale: number;
  purity: Purity;
  making_type: MakingType;
  making_value: number;
  stone_value: number;
  auto_price: boolean;
  /** Bangles / rings: show as a real 3D band (photo taken lying flat, from the side) */
  band_3d?: boolean;
  /** Bangle size like "2.6" or Indian ring size like "16" */
  band_size?: string;
  band_profile?: BandProfile;
  created_at: string;
};

// ---------- 3D bands ----------

export type BandProfile = 'flat' | 'dome' | 'round' | 'kada';

export const BAND_PROFILES: { key: BandProfile; label: string }[] = [
  { key: 'dome', label: 'Dome ◠' },
  { key: 'flat', label: 'Flat ▭' },
  { key: 'round', label: 'Round wire ●' },
  { key: 'kada', label: 'Kada (thick) ▬' },
];

/** Indian bangle sizes: 2.N = 2 + N/16 inch inner diameter. */
export const BANGLE_SIZES = ['2.2', '2.4', '2.6', '2.8', '2.10', '2.12'];
/** Indian ring sizes. */
export const RING_SIZES = ['8', '10', '12', '14', '16', '18', '20', '22', '24'];

export function bandInnerMm(part: BodyPart, size?: string): number {
  if (part === 'finger') {
    const n = Number(size) || 16;
    return 12.7 + 0.318 * n; // Indian size 16 -> 17.8 mm
  }
  const [inch, sixteenths] = (size || '2.6').split('.').map(Number);
  return ((inch || 2) + (sixteenths || 0) / 16) * 25.4; // 2.6 -> 60.3 mm
}

export function bandThickMm(part: BodyPart, profile?: BandProfile): number {
  if (part === 'finger') return profile === 'flat' ? 1.6 : 2.0;
  switch (profile) {
    case 'flat':
      return 2.0;
    case 'kada':
      return 6.0;
    case 'round':
      return 0; // native: thickness = wire width
    default:
      return 2.6;
  }
}

export const isBandPart = (p: BodyPart) => p === 'finger' || p === 'wrist';

export type JewelInput = Omit<Jewel, 'id' | 'created_at'>;

export const BODY_PARTS: {
  key: BodyPart;
  label: string;
  hint: string;
  defaultAnchor: { x: number; y: number };
}[] = [
  { key: 'ear', label: 'Earrings', hint: 'Show your face & ears', defaultAnchor: { x: 0.5, y: 0 } },
  { key: 'nose', label: 'Nose pin', hint: 'Look straight at the camera', defaultAnchor: { x: 0.5, y: 0.5 } },
  { key: 'forehead', label: 'Maang tikka', hint: 'Show your full face', defaultAnchor: { x: 0.5, y: 0 } },
  { key: 'neck', label: 'Necklace', hint: 'Show your face & neck', defaultAnchor: { x: 0.5, y: 0 } },
  { key: 'finger', label: 'Rings', hint: 'Show the back of your hand', defaultAnchor: { x: 0.5, y: 0.5 } },
  { key: 'wrist', label: 'Bangles', hint: 'Show your hand & wrist', defaultAnchor: { x: 0.5, y: 0.5 } },
];

export const partInfo = (k: BodyPart) => BODY_PARTS.find(p => p.key === k)!;
