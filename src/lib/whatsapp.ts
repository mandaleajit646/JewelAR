import { Alert, Linking } from 'react-native';
import { CURRENCY, SHOP_NAME } from '../config';
import { formatPrice } from '../theme';
import type { ShopSettings } from '../types';
import { track } from './supabase';

type Piece = { id: string; name: string; image_url: string };

/** Opens a WhatsApp chat with the shop, message pre-filled with the piece's details. */
export async function enquireOnWhatsApp(piece: Piece, price: number | null, settings: ShopSettings | null) {
  const number = (settings?.whatsapp_number ?? '').replace(/\D/g, '');
  if (!number) {
    Alert.alert('Not available yet', `${SHOP_NAME} has not added a WhatsApp number.`);
    return;
  }
  const text =
    `Hi ${SHOP_NAME}! I'm interested in this piece:\n\n` +
    `*${piece.name}*\n` +
    `Price: ${formatPrice(price, CURRENCY)}\n` +
    `Ref: ${piece.id.slice(0, 8).toUpperCase()}\n` +
    `${piece.image_url}`;
  track(piece.id, 'enquiry');
  try {
    await Linking.openURL(`https://wa.me/${number}?text=${encodeURIComponent(text)}`);
  } catch {
    Alert.alert('Could not open WhatsApp', 'Please make sure WhatsApp is installed.');
  }
}
