import type { SvgModifierSnapshotV2 } from './modelsV2';

export interface CaptureIdentityV2 {
  producerId: 'svgmodifier-panel';
  producerVersion: string;
  panelId: number;
  instanceId: string;
}

export interface CaptureRunV2 {
  generation: number;
  effectiveFromMs: number;
  effectiveToMs: number;
}

export interface CaptureSessionV2 {
  protocolVersion: 2;
  maxPayloadBytes: number;
  begin(run: CaptureRunV2): void;
  // The receiver calls build only for the active instance and current generation.
  publish(generation: number, build: () => SvgModifierSnapshotV2): void;
  fail(generation: number, error: { code: string; message: string }): void;
  close(): void;
}

export interface CaptureHookV2 {
  connect(identity: CaptureIdentityV2): CaptureSessionV2 | null;
}

declare global {
  interface Window {
    // A receiver installs this before navigation. The plugin never creates it.
    __SVG_MODIFIER_CAPTURE_V2__?: CaptureHookV2;
  }
}
