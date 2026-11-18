import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  /** Opens the Android share sheet (WhatsApp, Instagram…) with an image and caption. */
  shareImage(uri: string, message: string): Promise<void>;
  /** Saves an image to the phone's gallery (Pictures/<album>). */
  saveToGallery(uri: string, album: string): Promise<void>;
}

export default TurboModuleRegistry.get<Spec>('JewelShare');
