import type { Jewel, Purity, ShopSettings } from '../types';

const TROY_OUNCE_GRAMS = 31.1034768;

// Free, open-source (CC0), no API key: https://github.com/fawazahmed0/exchange-api
const SOURCES = [
  (m: string) => `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${m}.json`,
  (m: string) => `https://latest.currency-api.pages.dev/v1/currencies/${m}.json`,
];

async function fetchOunceInr(metal: 'xau' | 'xag'): Promise<{ inr: number; date: string }> {
  let lastErr: unknown;
  for (const url of SOURCES) {
    try {
      const res = await fetch(url(metal));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const inr = json?.[metal]?.inr;
      if (typeof inr !== 'number') throw new Error('Unexpected response');
      return { inr, date: json.date };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Could not fetch rates');
}

export type MarketRates = { gold24: number; gold22: number; gold18: number; silver: number; date: string };

/** International spot price converted to ₹ per gram (no local duty/GST/premium). */
export async function fetchMarketRates(): Promise<MarketRates> {
  const [gold, silver] = await Promise.all([fetchOunceInr('xau'), fetchOunceInr('xag')]);
  const g24 = gold.inr / TROY_OUNCE_GRAMS;
  return {
    gold24: g24,
    gold22: g24 * (22 / 24),
    gold18: g24 * (18 / 24),
    silver: silver.inr / TROY_OUNCE_GRAMS,
    date: gold.date,
  };
}

export const withPremium = (rate: number, premiumPercent: number) =>
  Math.round(rate * (1 + premiumPercent / 100));

export function rateFor(purity: Purity, s: ShopSettings | null): number | null {
  if (!s) return null;
  switch (purity) {
    case '24K':
      return s.gold24;
    case '22K':
      return s.gold22;
    case '18K':
      return s.gold18;
    case 'silver':
      return s.silver;
    default:
      return null;
  }
}

export type PriceBreakdown = {
  metal: number;
  making: number;
  stones: number;
  gst: number;
  total: number;
  rate: number;
};

type PriceInput = Pick<
  Jewel,
  'purity' | 'weight_g' | 'making_type' | 'making_value' | 'stone_value' | 'auto_price' | 'price'
>;

/** weight × today's rate + making + stones, then GST. Null if it cannot be computed. */
export function breakdown(j: PriceInput, s: ShopSettings | null): PriceBreakdown | null {
  if (!j.auto_price) return null;
  const rate = rateFor(j.purity, s);
  if (!rate || !j.weight_g) return null;
  const metal = j.weight_g * rate;
  const making =
    j.making_type === 'percent'
      ? (metal * j.making_value) / 100
      : j.making_type === 'per_gram'
        ? j.weight_g * j.making_value
        : j.making_value;
  const stones = j.stone_value ?? 0;
  const gst = ((metal + making + stones) * (s?.gst_percent ?? 0)) / 100;
  const round = (n: number) => Math.round(n);
  return {
    metal: round(metal),
    making: round(making),
    stones: round(stones),
    gst: round(gst),
    total: round(metal + making + stones + gst),
    rate,
  };
}

/** Final price to show: auto price if enabled and computable, else the manual price. */
export function priceOf(j: PriceInput, s: ShopSettings | null): number | null {
  return breakdown(j, s)?.total ?? j.price;
}
