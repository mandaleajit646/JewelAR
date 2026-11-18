import type * as React from 'react';
import type { CodegenTypes, HostComponent, ViewProps } from 'react-native';
import { codegenNativeCommands, codegenNativeComponent } from 'react-native';

type TrackingEvent = Readonly<{ tracking: boolean }>;
type CaptureEvent = Readonly<{ uri: string; error: string }>;

export interface NativeProps extends ViewProps {
  /** http(s):// or file:// url of a transparent PNG */
  imageUrl?: string;
  /** ear | nose | forehead | neck | finger | wrist */
  bodyPart?: string;
  /** Point on the jewellery image (0..1) that attaches to the body */
  anchorX?: CodegenTypes.WithDefault<CodegenTypes.Float, 0.5>;
  anchorY?: CodegenTypes.WithDefault<CodegenTypes.Float, 0.0>;
  /** Size multiplier set by the shop owner */
  sizeScale?: CodegenTypes.WithDefault<CodegenTypes.Float, 1.0>;
  /** front | back */
  cameraFacing?: string;
  /** Text stamped on captured photos, e.g. the shop name */
  watermark?: string;
  /** Bangles / kadas / rings: render a real 3D band around the wrist or finger */
  band3d?: CodegenTypes.WithDefault<boolean, false>;
  /** Inner diameter of the band in mm (from the bangle / ring size) */
  bandInnerMm?: CodegenTypes.WithDefault<CodegenTypes.Float, 0.0>;
  /** Radial thickness in mm (0 = default for the type) */
  bandThickMm?: CodegenTypes.WithDefault<CodegenTypes.Float, 0.0>;
  /** flat | dome | round | kada */
  bandProfile?: string;
  onTrackingChange?: CodegenTypes.DirectEventHandler<TrackingEvent>;
  /** Result of a capture() command: uri on success, error message otherwise */
  onCapture?: CodegenTypes.DirectEventHandler<CaptureEvent>;
}

type ComponentType = HostComponent<NativeProps>;

interface NativeCommands {
  /** Saves the current camera frame with the jewellery overlay; result arrives in onCapture. */
  capture: (viewRef: React.ElementRef<ComponentType>) => void;
}

export const Commands: NativeCommands = codegenNativeCommands<NativeCommands>({
  supportedCommands: ['capture'],
});

export default codegenNativeComponent<NativeProps>('ARTryOnView') as ComponentType;
