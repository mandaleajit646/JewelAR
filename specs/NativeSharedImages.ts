import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type SharedImage = { uri: string; mime: string };

export interface Spec extends TurboModule {
  /** Photos shared into the app (WhatsApp, Gallery…) since the last call, as file:// uris. */
  takeSharedImages(): Promise<SharedImage[]>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.get<Spec>('SharedImages');
