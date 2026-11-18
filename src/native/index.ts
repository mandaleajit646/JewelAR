import { DeviceEventEmitter, Platform } from 'react-native';
import NativeBackgroundRemover from '../../specs/NativeBackgroundRemover';
import NativeJewelShare from '../../specs/NativeJewelShare';
import NativeSharedImages, { SharedImage } from '../../specs/NativeSharedImages';
import ARTryOnViewComponent, { Commands } from '../../specs/ARTryOnViewNativeComponent';

// The codegen Babel plugin reserves the export name `Commands` for spec files,
// so re-export under different names here.
export const ARTryOnView = ARTryOnViewComponent;
export const ARTryOnCommands = Commands;
export type { RemovedBackground } from '../../specs/NativeBackgroundRemover';
export type { SharedImage } from '../../specs/NativeSharedImages';

const androidOnly = (what: string) => Promise.reject(new Error(`${what} is Android-only for now`));

export function removeBackground(uri: string) {
  if (Platform.OS !== 'android' || !NativeBackgroundRemover) return androidOnly('Background removal');
  return NativeBackgroundRemover.removeBackground(uri);
}

/** Upright JPEG of part of a photo (0..1 coords); 0,0,1,1 = whole photo. */
export function cropImage(uri: string, left = 0, top = 0, right = 1, bottom = 1) {
  if (Platform.OS !== 'android' || !NativeBackgroundRemover) return androidOnly('Cropping');
  return NativeBackgroundRemover.cropImage(uri, left, top, right, bottom);
}

export function shareImage(uri: string, message: string) {
  if (Platform.OS !== 'android' || !NativeJewelShare) return androidOnly('Sharing');
  return NativeJewelShare.shareImage(uri, message);
}

export function saveToGallery(uri: string, album: string) {
  if (Platform.OS !== 'android' || !NativeJewelShare) return androidOnly('Saving');
  return NativeJewelShare.saveToGallery(uri, album);
}

/** Photos shared into the app since the last call (empty on other platforms). */
export function takeSharedImages(): Promise<SharedImage[]> {
  if (Platform.OS !== 'android' || !NativeSharedImages) return Promise.resolve([]);
  return NativeSharedImages.takeSharedImages();
}

/** Calls [cb] whenever new photos are shared into the app. */
export function onSharedImages(cb: () => void) {
  const sub = DeviceEventEmitter.addListener('SharedImages', cb);
  return () => sub.remove();
}
