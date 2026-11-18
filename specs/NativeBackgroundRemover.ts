import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type RemovedBackground = {
  uri: string; // file:// path to a transparent, trimmed PNG
  width: number;
  height: number;
};

export interface Spec extends TurboModule {
  /** Removes the background from an image (content:// or file:// uri) fully on-device. */
  removeBackground(uri: string): Promise<RemovedBackground>;
  /**
   * Upright (EXIF applied), downscaled JPEG of part of an image. left/top/right/bottom are 0..1
   * of the upright image; pass 0, 0, 1, 1 for the whole photo.
   */
  cropImage(uri: string, left: number, top: number, right: number, bottom: number): Promise<RemovedBackground>;
}

export default TurboModuleRegistry.get<Spec>('BackgroundRemover');
