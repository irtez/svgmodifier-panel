import type { SvgModifierSnapshotV1 } from './models';

export interface CaptureIdentityV1 {
  producerId: 'svgmodifier-panel';
  producerVersion: string;
  panelId: number;
  instanceId: string;
}

export interface CaptureRunV1 {
  generation: number;
  effectiveFromMs: number;
  effectiveToMs: number;
}

export interface CaptureSessionV1 {
  protocolVersion: 1;
  maxPayloadBytes: number;
  begin(run: CaptureRunV1): void;
  // The receiver calls build only for the active instance and current generation.
  publish(generation: number, build: () => SvgModifierSnapshotV1): void;
  fail(generation: number, error: { code: string; message: string }): void;
  close(): void;
}

export interface CaptureHookV1 {
  connect(identity: CaptureIdentityV1): CaptureSessionV1 | null;
}

declare global {
  interface Window {
    // A receiver installs this before navigation. The plugin never creates it.
    __SVG_MODIFIER_CAPTURE_V1__?: CaptureHookV1;
  }
}
