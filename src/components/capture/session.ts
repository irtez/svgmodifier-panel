import type { CaptureRunV1, CaptureSessionV1 } from './protocol';
import type { SvgModifierSnapshotV1 } from './models';

export type CaptureRuntime = typeof import('./runtime');
export type RuntimeLoader = () => Promise<CaptureRuntime>;
export interface CaptureTicket {
  readonly generation: number;
  readonly connection: CaptureConnection;
  current(): boolean;
  load(): Promise<CaptureRuntime | null>;
  publish(build: () => SvgModifierSnapshotV1): void;
  fail(code?: string): void;
}
export interface CaptureConnection {
  readonly panelId: number;
  readonly producerVersion: string;
  begin(time: Omit<CaptureRunV1, 'generation'>): CaptureTicket;
  close(): void;
}
export const loadCaptureRuntime: RuntimeLoader = () => import(/* webpackChunkName: "svg-capture" */ './runtime');
let instanceSequence = 0;

// Даже неожиданно async callback не оставляет unhandled rejection в пользовательской странице.
function observeReturn(value: unknown) {
  if (value && (typeof value === 'object' || typeof value === 'function')) {
    void Promise.resolve(value).catch(() => undefined);
  }
}

export function connectCapture(
  panelId: number,
  producerVersion: string,
  load = loadCaptureRuntime
): CaptureConnection | null {
  let raw: CaptureSessionV1 | null = null;
  let handle: CaptureSessionV1;
  let cleanupAttempted = false;
  const reject = () => {
    if (cleanupAttempted) {
      return null;
    }
    cleanupAttempted = true;
    try {
      observeReturn(raw);
      if (typeof raw?.close === 'function') {
        observeReturn(raw.close());
      }
    } catch {
      /* Даже getter close может принадлежать неисправному receiver. */
    }
    return null;
  };
  try {
    if (!Number.isSafeInteger(panelId) || panelId < 0) {
      return null;
    }
    const hook = window.__SVG_MODIFIER_CAPTURE_V1__;
    if (!hook || typeof hook.connect !== 'function') {
      return null;
    }
    raw = hook.connect({
      producerId: 'svgmodifier-panel',
      producerVersion,
      panelId,
      instanceId: Date.now().toString(36) + '-' + ++instanceSequence + '-' + Math.random().toString(36).slice(2),
    });
    if (!raw) {
      return null;
    }
    const { protocolVersion, maxPayloadBytes, begin, publish, fail, close } = raw;
    if (
      protocolVersion !== 1 ||
      !Number.isSafeInteger(maxPayloadBytes) ||
      maxPayloadBytes <= 0 ||
      ![begin, publish, fail, close].every((method) => typeof method === 'function')
    ) {
      return reject();
    }
    // Getter-ы чужого handle читаются один раз, под защитой, не во время React render.
    handle = {
      protocolVersion,
      maxPayloadBytes,
      begin: begin.bind(raw),
      publish: publish.bind(raw),
      fail: fail.bind(raw),
      close: close.bind(raw),
    };
  } catch {
    return reject();
  }

  let closed = false;
  let generation = 0;
  let runtime: Promise<CaptureRuntime> | undefined;
  const connection: CaptureConnection = {
    panelId,
    producerVersion,
    close() {
      if (closed) {
        return;
      }
      closed = true;
      runtime = undefined;
      try {
        observeReturn(handle.close());
      } catch {
        /* Экспорт не управляет UI. */
      }
    },
    begin(time) {
      const currentGeneration = ++generation;
      let failed = false;
      let published = false;
      const current = () => !closed && generation === currentGeneration && !failed;
      const ticket: CaptureTicket = {
        generation: currentGeneration,
        connection,
        current,
        fail(code = 'CAPTURE_EXPORT_FAILED') {
          if (!current()) {
            return;
          }
          failed = true;
          try {
            observeReturn(handle.fail(currentGeneration, { code, message: 'Не удалось получить снимок панели.' }));
          } catch {
            /* Изолировано от UI. */
          }
        },
        async load() {
          if (!current()) {
            return null;
          }
          try {
            runtime ??= load();
            const loaded = await runtime;
            return current() ? loaded : null;
          } catch {
            ticket.fail();
            return null;
          }
        },
        publish(build) {
          if (!current() || published) {
            return;
          }
          published = true;
          let withinCall = true;
          let built = false;
          try {
            observeReturn(
              handle.publish(currentGeneration, () => {
                if (!withinCall || built || !current()) {
                  throw new Error('CAPTURE_STALE_PUBLICATION');
                }
                built = true;
                return build();
              })
            );
          } catch {
            ticket.fail();
          } finally {
            withinCall = false;
          }
        },
      };
      if (current()) {
        try {
          observeReturn(
            handle.begin({
              generation: currentGeneration,
              effectiveFromMs: time.effectiveFromMs,
              effectiveToMs: time.effectiveToMs,
            })
          );
        } catch {
          ticket.fail();
        }
      }
      return ticket;
    },
  };
  return connection;
}
