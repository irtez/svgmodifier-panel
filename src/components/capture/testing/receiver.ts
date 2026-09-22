// Только browser-harness: модуль не входит в runtime плагина или Go renderer.
import type { JsonValue, SvgModifierSnapshotV1 } from '../models';
import type { CaptureHookV1, CaptureIdentityV1, CaptureRunV1, CaptureSessionV1 } from '../protocol';

export interface ReceiverOptions {
  panelId: number;
  maxPayloadBytes?: number;
  validate?: (value: unknown) => string[];
}

export type DeepReadonly<T> = T extends Array<infer Item>
  ? ReadonlyArray<DeepReadonly<Item>>
  : T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;

const ERROR_MESSAGES = {
  CAPTURE_INSTANCE_AMBIGUOUS: 'More than one matching panel instance is active.',
  CAPTURE_PAYLOAD_TOO_LARGE: 'Capture payload exceeds the receiver limit.',
  CAPTURE_PAYLOAD_INVALID: 'Capture payload does not match the expected contract.',
  CAPTURE_DATA_STATE_UNSUPPORTED: 'The panel data state is not supported for capture.',
  CAPTURE_EXPORT_FAILED: 'The panel could not produce a capture payload.',
  CAPTURE_PROTOCOL_UNSUPPORTED: 'The capture protocol is not supported.',
  CAPTURE_FRAME_UNSUPPORTED: 'The producer frame is not supported for capture.',
  CAPTURE_PRODUCER_MISSING: 'No compatible capture producer is available.',
} as const;
type ErrorCode = keyof typeof ERROR_MESSAGES;

interface StateFields {
  readonly identity: Readonly<CaptureIdentityV1> | null;
  readonly generation: number | null;
  readonly snapshot?: DeepReadonly<SvgModifierSnapshotV1>;
  readonly payloadBytes?: number;
  readonly error?: Readonly<{ code: ErrorCode; message: string }>;
}

export type ReceiverState = StateFields &
  (
    | { readonly status: 'idle'; readonly generation: null }
    | { readonly status: 'pending'; readonly identity: Readonly<CaptureIdentityV1>; readonly generation: number }
    | { readonly status: 'terminal-error'; readonly error: Readonly<{ code: ErrorCode; message: string }> }
    | {
        readonly status: 'terminal-ok';
        readonly identity: Readonly<CaptureIdentityV1>;
        readonly generation: number;
        readonly snapshot: DeepReadonly<SvgModifierSnapshotV1>;
        readonly payloadBytes: number;
      }
  );

export interface TestCaptureReceiver {
  read(): ReceiverState;
  dispose(): void;
}

// Отдельные пределы работы защищают от глубокого или очень широкого компактного JSON.
const MAX_DEPTH = 64;
const MAX_VALUES = 100000;
const DEFAULT_PAYLOAD_BYTES = 1024 * 1024;

class CopyFailure {
  constructor(readonly code: 'CAPTURE_PAYLOAD_INVALID' | 'CAPTURE_PAYLOAD_TOO_LARGE') {}
}

function invalid(): never {
  throw new CopyFailure('CAPTURE_PAYLOAD_INVALID');
}
function tooLarge(): never {
  throw new CopyFailure('CAPTURE_PAYLOAD_TOO_LARGE');
}

/** Копия строится с бюджетом; не создаём полную JSON-строку или UTF-8 буфер. */
function boundedCopy(input: unknown, maxBytes: number): { value: JsonValue; bytes: number } {
  let bytes = 0;
  let values = 0;
  const ancestors = new Set<object>();
  const spend = (count: number) => {
    if (count > maxBytes - bytes) {
      tooLarge();
    }
    bytes += count;
  };
  const string = (value: string) => {
    // Любой UTF-16 code unit занимает хотя бы байт JSON; большая строка отсеивается сразу.
    if (value.length + 2 > maxBytes - bytes) {
      tooLarge();
    }
    spend(2);
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code === 34 || code === 92) {
        spend(2);
      } else if (code < 32) {
        spend([8, 9, 10, 12, 13].includes(code) ? 2 : 6);
      } else if (code < 0x80) {
        spend(1);
      } else if (code < 0x800) {
        spend(2);
      } else if (code >= 0xd800 && code <= 0xdbff) {
        const next = value.charCodeAt(i + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          spend(4);
          i++;
        } else {
          spend(6);
        }
      } else {
        spend(code >= 0xdc00 && code <= 0xdfff ? 6 : 3);
      }
    }
  };
  const visit = (value: unknown, depth: number): JsonValue => {
    if (++values > MAX_VALUES || depth > MAX_DEPTH) {
      tooLarge();
    }
    if (value === null) {
      spend(4);
      return null;
    }
    if (typeof value === 'string') {
      string(value);
      return value;
    }
    if (typeof value === 'boolean') {
      spend(value ? 4 : 5);
      return value;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        invalid();
      }
      spend(String(value).length);
      return value;
    }
    if (typeof value !== 'object' || ancestors.has(value)) {
      invalid();
    }
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
      invalid();
    }
    let arrayLength: number | undefined;
    if (array) {
      // Длина известна без перечисления ключей: даже массив однозначных чисел требует [0,0,...].
      const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
      if (!safeInteger(length) || length < 0) {
        invalid();
      }
      arrayLength = length;
      const minimumBytes = length === 0 ? 2 : length * 2 + 1;
      if (length > MAX_VALUES - values || minimumBytes > maxBytes - bytes) {
        tooLarge();
      }
    }
    const keys = Reflect.ownKeys(value);
    const count = keys.length - (array ? 1 : 0);
    if (count > MAX_VALUES - values || count > maxBytes - bytes) {
      tooLarge();
    }
    if (array && arrayLength !== count) {
      invalid();
    }
    const copy: JsonValue[] | Record<string, JsonValue> = array ? [] : {};
    ancestors.add(value);
    spend(2);
    let entries = 0;
    for (const key of keys) {
      if (array && key === 'length') {
        continue;
      }
      if (typeof key !== 'string') {
        invalid();
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        invalid();
      }
      if (entries > 0) {
        spend(1);
      }
      if (array) {
        if (key !== String(entries)) {
          invalid();
        }
      } else {
        string(key);
        spend(1);
      }
      const child = visit(descriptor.value, depth + 1);
      // defineProperty сохраняет ключ __proto__ как данные без вызова setter.
      Object.defineProperty(copy, key, { value: child, enumerable: true, writable: false, configurable: false });
      entries++;
    }
    ancestors.delete(value);
    return Object.freeze(copy) as JsonValue;
  };
  return { value: visit(input, 0), bytes };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function identityFrom(input: unknown, panelId: number): Readonly<CaptureIdentityV1> | null {
  try {
    const value = boundedCopy(input, 2048).value;
    if (
      !record(value) ||
      Object.keys(value).length !== 4 ||
      value.producerId !== 'svgmodifier-panel' ||
      value.panelId !== panelId ||
      typeof value.producerVersion !== 'string' ||
      !value.producerVersion.trim() ||
      value.producerVersion.length > 128 ||
      typeof value.instanceId !== 'string' ||
      !value.instanceId.trim() ||
      value.instanceId.length > 256
    ) {
      return null;
    }
    return value as unknown as Readonly<CaptureIdentityV1>;
  } catch {
    return null;
  }
}

function runFrom(input: unknown): Readonly<CaptureRunV1> | null {
  try {
    const value = boundedCopy(input, 256).value;
    if (
      !record(value) ||
      Object.keys(value).length !== 3 ||
      !safeInteger(value.generation) ||
      value.generation < 1 ||
      !safeInteger(value.effectiveFromMs) ||
      !safeInteger(value.effectiveToMs) ||
      value.effectiveToMs < value.effectiveFromMs
    ) {
      return null;
    }
    return value as unknown as Readonly<CaptureRunV1>;
  } catch {
    return null;
  }
}

function matchesRun(value: JsonValue, identity: Readonly<CaptureIdentityV1>, run: Readonly<CaptureRunV1>): boolean {
  if (
    !record(value) ||
    value.kind !== 'svgmodifier' ||
    value.schemaVersion !== 1 ||
    !record(value.producer) ||
    value.producer.id !== identity.producerId ||
    value.producer.version !== identity.producerVersion ||
    !record(value.panel) ||
    value.panel.id !== identity.panelId ||
    !record(value.observed)
  ) {
    return false;
  }
  const observed = value.observed;
  return (
    observed.generation === run.generation &&
    observed.effectiveFromMs === run.effectiveFromMs &&
    observed.effectiveToMs === run.effectiveToMs &&
    safeInteger(observed.evaluatedAtMs) &&
    (observed.dataState === 'Done' || observed.dataState === 'Error')
  );
}

interface LiveSession {
  identity: Readonly<CaptureIdentityV1>;
  highestGeneration: number;
  run: Readonly<CaptureRunV1> | null;
}

export function installReceiver(options: ReceiverOptions): TestCaptureReceiver {
  const { panelId, validate } = options;
  const maxPayloadBytes = options.maxPayloadBytes ?? DEFAULT_PAYLOAD_BYTES;
  if (!safeInteger(panelId) || panelId < 0 || !safeInteger(maxPayloadBytes) || maxPayloadBytes < 1) {
    throw new Error('Invalid test capture receiver options.');
  }
  const ownerWindow = window;
  const live = new Set<LiveSession>();
  let disposed = false;
  const idle = (identity: Readonly<CaptureIdentityV1> | null = null): ReceiverState =>
    Object.freeze({ status: 'idle', identity, generation: null });
  let state = idle();
  const error = (code: ErrorCode, session?: LiveSession) => {
    state = Object.freeze({
      status: 'terminal-error',
      identity: session?.identity ?? null,
      generation: session?.run?.generation ?? null,
      error: Object.freeze({ code, message: ERROR_MESSAGES[code] }),
    });
  };
  const current = (session: LiveSession, generation: number) =>
    !disposed && live.size === 1 && live.has(session) && session.run !== null && session.run.generation === generation;
  const membershipChanged = () => {
    // При неоднозначности уничтожаем run каждого handle; закрытие соседа не возвращает старый результат.
    for (const session of live) {
      session.run = null;
    }
    if (live.size > 1) {
      error('CAPTURE_INSTANCE_AMBIGUOUS');
    } else {
      state = idle(live.values().next().value?.identity ?? null);
    }
  };
  const hook: CaptureHookV1 = Object.freeze({
    connect(input: CaptureIdentityV1): CaptureSessionV1 | null {
      if (disposed) {
        return null;
      }
      const identity = identityFrom(input, panelId);
      if (!identity || disposed) {
        return null;
      }
      const session: LiveSession = { identity, highestGeneration: 0, run: null };
      live.add(session);
      membershipChanged();
      return Object.freeze({
        protocolVersion: 1 as const,
        maxPayloadBytes,
        begin(input: CaptureRunV1) {
          if (disposed || !live.has(session)) {
            return;
          }
          const run = runFrom(input);
          if (!run || run.generation <= session.highestGeneration || disposed || !live.has(session)) {
            return;
          }
          session.highestGeneration = run.generation;
          if (live.size !== 1) {
            return;
          }
          session.run = run;
          state = Object.freeze({ status: 'pending', identity, generation: run.generation });
        },
        publish(generation: number, build: () => SvgModifierSnapshotV1) {
          if (!current(session, generation)) {
            return;
          }
          const run = session.run!;
          const previousState = state;
          const unchanged = () => current(session, generation) && session.run === run && state === previousState;
          let value: unknown;
          try {
            value = build();
          } catch {
            if (unchanged()) {
              error('CAPTURE_EXPORT_FAILED', session);
            }
            return;
          }
          if (!unchanged()) {
            return;
          }
          try {
            const copied = boundedCopy(value, maxPayloadBytes);
            if (!matchesRun(copied.value, identity, run)) {
              invalid();
            }
            if (validate && validate(copied.value).length !== 0) {
              invalid();
            }
            // build, Proxy traps и test validator могут синхронно закрыть instance/начать следующий run.
            if (!unchanged()) {
              return;
            }
            state = Object.freeze({
              status: 'terminal-ok',
              identity,
              generation,
              snapshot: copied.value as unknown as DeepReadonly<SvgModifierSnapshotV1>,
              payloadBytes: copied.bytes,
            });
          } catch (caught) {
            if (unchanged()) {
              error(caught instanceof CopyFailure ? caught.code : 'CAPTURE_PAYLOAD_INVALID', session);
            }
          }
        },
        fail(generation: number, input: { code: string; message: string }) {
          if (!current(session, generation)) {
            return;
          }
          const run = session.run;
          let code: ErrorCode = 'CAPTURE_EXPORT_FAILED';
          try {
            // Текст producer не читается/не сохраняется, включая getters и длинные строки.
            const descriptor = Object.getOwnPropertyDescriptor(input, 'code');
            if (
              descriptor &&
              'value' in descriptor &&
              typeof descriptor.value === 'string' &&
              descriptor.value.length <= 64 &&
              Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, descriptor.value)
            ) {
              code = descriptor.value as ErrorCode;
            }
          } catch {
            /* Только безопасный код по умолчанию. */
          }
          if (current(session, generation) && session.run === run) {
            error(code, session);
          }
        },
        close() {
          if (!live.delete(session)) {
            return;
          }
          session.run = null;
          membershipChanged();
        },
      });
    },
  });
  ownerWindow.__SVG_MODIFIER_CAPTURE_V1__ = hook;
  return Object.freeze({
    read: () => state,
    dispose() {
      disposed = true;
      for (const session of live) {
        session.run = null;
      }
      live.clear();
      state = idle();
      if (ownerWindow.__SVG_MODIFIER_CAPTURE_V1__ === hook) {
        delete ownerWindow.__SVG_MODIFIER_CAPTURE_V1__;
      }
    },
  });
}
