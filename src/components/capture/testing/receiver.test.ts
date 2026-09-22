import { readFileSync } from 'fs';
import { resolve } from 'path';
import { installReceiver, type TestCaptureReceiver } from './receiver';
import type { SvgModifierSnapshotV1 } from '../models';
import type { CaptureIdentityV1, CaptureSessionV1 } from '../protocol';
import { validateSnapshot } from './validateSnapshot';

function fixture(): SvgModifierSnapshotV1 {
  return JSON.parse(readFileSync(resolve(__dirname, '../../../../docs/examples/capture-v1.json'), 'utf8'));
}

const identity: CaptureIdentityV1 = {
  producerId: 'svgmodifier-panel',
  producerVersion: '1.4.0',
  panelId: 7,
  instanceId: 'mount-a',
};
const run = { generation: 1, effectiveFromMs: 1000, effectiveToMs: 2000 };

function snapshot(generation = 1): SvgModifierSnapshotV1 {
  const value = fixture();
  value.producer.version = identity.producerVersion;
  Object.assign(value.observed, run, { generation });
  return value;
}

function connect(instanceId = 'mount-a'): CaptureSessionV1 {
  const session = window.__SVG_MODIFIER_CAPTURE_V1__!.connect({ ...identity, instanceId });
  expect(session).not.toBeNull();
  return session!;
}

describe('bounded test browser receiver', () => {
  let receiver: TestCaptureReceiver;
  beforeEach(() => {
    receiver = installReceiver({ panelId: 7 });
  });
  afterEach(() => {
    receiver.dispose();
    delete window.__SVG_MODIFIER_CAPTURE_V1__;
  });

  it('[R22] сохраняет обычное JSON-поле toJSON без исполнения или изменения значения', () => {
    const session = connect();
    const value = snapshot();
    value.metrics[0].settings.extra = { toJSON: 'authored value' };
    session.begin(run);
    session.publish(1, () => value);
    expect(receiver.read().status).toBe('terminal-ok');
    expect(receiver.read().snapshot?.metrics[0].settings.extra).toEqual({ toJSON: 'authored value' });
  });

  it('[R01] publishes one detached immutable snapshot with matching identity and observed run', () => {
    const session = connect();
    const value = snapshot();
    session.begin(run);
    expect(receiver.read()).toMatchObject({ status: 'pending', identity, generation: 1 });
    session.publish(1, () => value);
    const state = receiver.read();
    expect(state).toMatchObject({ status: 'terminal-ok', identity, generation: 1, snapshot: value });
    expect(state.payloadBytes).toBe(Buffer.byteLength(JSON.stringify(value), 'utf8'));
    expect(validateSnapshot(state.snapshot, { panelId: 7, maxPayloadBytes: 1024 * 1024 })).toEqual([]);
    value.panel.title = 'Changed after publication';
    value.metrics[0].scalar!.value = 999;
    expect(state.snapshot!.panel.title).not.toBe(value.panel.title);
    expect(state.snapshot!.metrics[0].scalar!.value).toBe(12.3456789012);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.snapshot!.metrics[0].scalar)).toBe(true);
    expect(Object.isFrozen(state.identity)).toBe(true);
  });

  it('[R02] rejects wrong panels and malformed producer identity without disturbing the target', () => {
    const hook = window.__SVG_MODIFIER_CAPTURE_V1__!;
    for (const changed of [
      { panelId: 8 },
      { panelId: NaN },
      { producerId: 'other' },
      { producerVersion: '' },
      { producerVersion: 'x'.repeat(10000) },
      { instanceId: '' },
      { instanceId: 'x'.repeat(10000) },
    ]) {
      expect(hook.connect({ ...identity, ...changed } as CaptureIdentityV1)).toBeNull();
    }
    let reads = 0;
    expect(
      hook.connect(
        Object.defineProperty({ ...identity }, 'panelId', {
          get: () => {
            reads++;
            return 7;
          },
        })
      )
    ).toBeNull();
    expect(reads).toBe(0);
    expect(receiver.read()).toMatchObject({ status: 'idle', identity: null });
  });

  it('[R03] clears stale terminals at begin and never builds late, closed or disposed runs', () => {
    const session = connect();
    let builds = 0;
    const build = () => {
      builds++;
      return snapshot();
    };
    session.publish(1, build);
    expect(builds).toBe(0);
    session.begin(run);
    session.publish(1, build);
    session.begin({ ...run, generation: 2 });
    expect(receiver.read()).toMatchObject({ status: 'pending', generation: 2 });
    expect(receiver.read().snapshot).toBeUndefined();
    session.publish(1, build);
    session.begin(run);
    expect(receiver.read().generation).toBe(2);
    session.close();
    session.publish(2, build);
    expect(receiver.read().status).toBe('idle');
    receiver.dispose();
    session.begin({ ...run, generation: 3 });
    session.publish(3, build);
    expect(builds).toBe(1);
    expect(window.__SVG_MODIFIER_CAPTURE_V1__).toBeUndefined();
  });

  it.each(['mount-a', 'mount-b'])(
    '[R04] invalidates duplicate live sessions (%s) until a fresh unique begin',
    (secondId) => {
      const a = connect();
      a.begin(run);
      a.publish(1, () => snapshot());
      const b = connect(secondId);
      let builds = 0;
      a.publish(1, () => {
        builds++;
        return snapshot();
      });
      b.begin({ ...run, generation: 5 });
      expect(receiver.read()).toMatchObject({
        status: 'terminal-error',
        identity: null,
        error: { code: 'CAPTURE_INSTANCE_AMBIGUOUS' },
      });
      b.close();
      expect(receiver.read()).toMatchObject({ status: 'idle', identity, generation: null });
      a.publish(1, () => {
        builds++;
        return snapshot();
      });
      a.begin(run);
      expect(receiver.read().status).toBe('idle');
      a.begin({ ...run, generation: 2 });
      a.publish(2, () => snapshot(2));
      expect(receiver.read()).toMatchObject({ status: 'terminal-ok', generation: 2 });
      expect(builds).toBe(0);
    }
  );

  it('[R05] guards against synchronous reentrancy while building or validating', () => {
    const session = connect();
    session.begin(run);
    session.publish(1, () => {
      session.begin({ ...run, generation: 2 });
      return snapshot();
    });
    expect(receiver.read()).toMatchObject({ status: 'pending', generation: 2 });
    session.publish(2, () => {
      session.close();
      return snapshot(2);
    });
    expect(receiver.read()).toMatchObject({ status: 'idle', identity: null });
  });

  it('[R06] maps build failures and producer failures to safe stable errors for the current run only', () => {
    const session = connect();
    session.begin(run);
    session.publish(1, () => {
      throw new Error('secret-token and stack');
    });
    expect(receiver.read()).toMatchObject({ status: 'terminal-error', error: { code: 'CAPTURE_EXPORT_FAILED' } });
    expect(JSON.stringify(receiver.read())).not.toContain('secret-token');
    session.begin({ ...run, generation: 2 });
    session.fail(1, { code: 'CAPTURE_EXPORT_FAILED', message: 'late' });
    expect(receiver.read().status).toBe('pending');
    session.fail(2, { code: 'CAPTURE_DATA_STATE_UNSUPPORTED', message: 'private streaming failure' });
    expect(receiver.read()).toMatchObject({
      status: 'terminal-error',
      generation: 2,
      error: { code: 'CAPTURE_DATA_STATE_UNSUPPORTED' },
    });
    expect(JSON.stringify(receiver.read())).not.toContain('private');
  });

  it.each([
    [
      'kind',
      (v: any) => {
        v.kind = 'table';
      },
    ],
    [
      'schema',
      (v: any) => {
        v.schemaVersion = 2;
      },
    ],
    [
      'producer',
      (v: any) => {
        v.producer.id = 'other';
      },
    ],
    [
      'version',
      (v: any) => {
        v.producer.version = '1.0.0';
      },
    ],
    [
      'panel',
      (v: any) => {
        v.panel.id = 8;
      },
    ],
    [
      'generation',
      (v: any) => {
        v.observed.generation = 2;
      },
    ],
    [
      'from',
      (v: any) => {
        v.observed.effectiveFromMs = 999;
      },
    ],
    [
      'to',
      (v: any) => {
        v.observed.effectiveToMs = 2001;
      },
    ],
    [
      'streaming',
      (v: any) => {
        v.observed.dataState = 'Streaming';
      },
    ],
    [
      'evaluated time',
      (v: any) => {
        v.observed.evaluatedAtMs = 0.5;
      },
    ],
  ])('[R07] rejects forged %s fields', (_name, mutate) => {
    const session = connect();
    const value = snapshot();
    mutate(value);
    session.begin(run);
    session.publish(1, () => value);
    expect(receiver.read()).toMatchObject({ status: 'terminal-error', error: { code: 'CAPTURE_PAYLOAD_INVALID' } });
    expect(receiver.read().snapshot).toBeUndefined();
  });

  it('[R08] uses optional schema validation only after a bounded detached copy and hides validation errors', () => {
    receiver.dispose();
    receiver = installReceiver({
      panelId: 7,
      validate: (value) => validateSnapshot(value, { panelId: 7, maxPayloadBytes: 1024 * 1024 }),
    });
    const session = connect();
    const value = snapshot();
    value.elements[0].winnerMetricId = 'missing-metric';
    session.begin(run);
    session.publish(1, () => value);
    expect(receiver.read()).toMatchObject({ status: 'terminal-error', error: { code: 'CAPTURE_PAYLOAD_INVALID' } });
  });

  it.each([
    ['undefined', () => undefined],
    ['NaN', () => NaN],
    ['Infinity', () => Infinity],
    ['bigint', () => BigInt(1)],
    ['function', () => () => 1],
    ['symbol', () => Symbol('x')],
    ['Date', () => new Date(0)],
    ['Map', () => new Map()],
    ['Set', () => new Set()],
    ['Error', () => new Error('secret')],
    ['DOM', () => document.createElement('div')],
    ['boxed primitive', () => Object('value')],
    ['prototype', () => Object.create({ inherited: true })],
    ['hole', () => Array(3)],
    ['array property', () => Object.assign([1], { extra: true })],
    ['symbol key', () => ({ [Symbol('hidden')]: 1 })],
    ['non-enumerable key', () => Object.defineProperty({}, 'hidden', { value: 1 })],
    [
      'cycle',
      () => {
        const value: unknown[] = [];
        value.push(value);
        return value;
      },
    ],
  ])('[R09] rejects %s without silently coercing or omitting values', (_name, buildValue) => {
    const session = connect();
    const value = snapshot();
    value.metrics[0].settings.extra = buildValue() as never;
    session.begin(run);
    session.publish(1, () => value);
    expect(receiver.read()).toMatchObject({ status: 'terminal-error', error: { code: 'CAPTURE_PAYLOAD_INVALID' } });
  });

  it('[R10] rejects accessors and toJSON without running them', () => {
    let executions = 0;
    const session = connect();
    const value = snapshot();
    value.metrics[0].settings.extra = Object.defineProperty({}, 'secret', {
      enumerable: true,
      get: () => {
        executions++;
        throw new Error('must not run');
      },
    });
    session.begin(run);
    session.publish(1, () => value);
    expect(receiver.read().error?.code).toBe('CAPTURE_PAYLOAD_INVALID');
    session.begin({ ...run, generation: 2 });
    value.observed.generation = 2;
    value.metrics[0].settings.extra = {
      toJSON: () => {
        executions++;
        return 'hidden';
      },
    } as never;
    session.publish(2, () => value);
    expect(receiver.read().error?.code).toBe('CAPTURE_PAYLOAD_INVALID');
    expect(executions).toBe(0);
  });

  it.each(['plain', 'utf8', 'escapes', 'surrogates', 'keys'])(
    '[R11] counts exact UTF-8 JSON bytes at the boundary: %s',
    (kind) => {
      const value = snapshot();
      const texts: Record<string, string> = {
        plain: 'synthetic',
        utf8: 'éЖ字😀',
        escapes: '\u0000\b\f\n\r\t"\\',
        surrogates: '\ud800\udc00\ud800x\udc00',
        keys: 'key\n\ud800😀',
      };
      value.panel.title = texts[kind];
      value.metrics[0].settings[texts[kind]] = texts[kind];
      const byteLength = Buffer.byteLength(JSON.stringify(value), 'utf8');
      receiver.dispose();
      receiver = installReceiver({ panelId: 7, maxPayloadBytes: byteLength });
      let session = connect();
      session.begin(run);
      session.publish(1, () => value);
      expect(receiver.read()).toMatchObject({ status: 'terminal-ok', payloadBytes: byteLength });
      receiver.dispose();
      receiver = installReceiver({ panelId: 7, maxPayloadBytes: byteLength - 1 });
      session = connect();
      session.begin(run);
      session.publish(1, () => value);
      expect(receiver.read()).toMatchObject({ status: 'terminal-error', error: { code: 'CAPTURE_PAYLOAD_TOO_LARGE' } });
      expect(receiver.read().snapshot).toBeUndefined();
    }
  );

  it('[R12] rejects huge strings before serialization, validation or inspection of later values', () => {
    receiver.dispose();
    let validations = 0;
    receiver = installReceiver({
      panelId: 7,
      maxPayloadBytes: 20000,
      validate: () => {
        validations++;
        return [];
      },
    });
    const session = connect();
    const value = snapshot();
    value.panel.title = '😀'.repeat(2_000_000);
    let reads = 0;
    Object.defineProperty(value.observed, 'generation', {
      enumerable: true,
      get: () => {
        reads++;
        return 1;
      },
    });
    session.begin(run);
    const stringify = jest.spyOn(JSON, 'stringify').mockImplementation(() => {
      throw new Error('unbounded serializer');
    });
    try {
      session.publish(1, () => value);
    } finally {
      stringify.mockRestore();
    }
    expect(receiver.read().error?.code).toBe('CAPTURE_PAYLOAD_TOO_LARGE');
    expect(reads).toBe(0);
    expect(validations).toBe(0);
  });

  it('[R13] bounds depth and traversal work even for compact JSON', () => {
    const session = connect();
    const deep = snapshot();
    let child: unknown = null;
    for (let i = 0; i < 200; i++) {
      child = [child];
    }
    deep.metrics[0].settings.extra = child as never;
    session.begin(run);
    session.publish(1, () => deep);
    expect(receiver.read().error?.code).toBe('CAPTURE_PAYLOAD_TOO_LARGE');
    const wide = snapshot(2);
    wide.metrics[0].settings.extra = Array(100001).fill(0);
    session.begin({ ...run, generation: 2 });
    session.publish(2, () => wide);
    expect(receiver.read().error?.code).toBe('CAPTURE_PAYLOAD_TOO_LARGE');
  });

  it('[R14] copies null-prototype and __proto__ data without polluting prototypes or losing aliases', () => {
    const session = connect();
    const value = snapshot();
    const shared = Object.assign(Object.create(null), { count: 0 });
    value.metrics[0].settings.extra = JSON.parse('{"__proto__":{"safe":true}}');
    value.metrics[0].settings.first = shared;
    value.metrics[0].settings.second = shared;
    session.begin(run);
    session.publish(1, () => value);
    expect(receiver.read().status).toBe('terminal-ok');
    const settings: unknown = receiver.read().snapshot!.metrics[0].settings;
    expect(settings).toMatchObject({ first: { count: 0 }, second: { count: 0 } });
    expect(Object.hasOwn(receiver.read().snapshot!.metrics[0].settings.extra as object, '__proto__')).toBe(true);
    expect(Object.prototype).not.toHaveProperty('safe');
    shared.count = 4;
    expect(receiver.read().snapshot!.metrics[0].settings.first).toEqual({ count: 0 });
  });

  it('[R15] keeps separate installations isolated and disposal removes only its own hook', () => {
    const first = receiver;
    const firstSession = connect();
    firstSession.begin(run);
    receiver = installReceiver({ panelId: 7 });
    const secondHook = window.__SVG_MODIFIER_CAPTURE_V1__;
    const secondSession = connect();
    secondSession.begin(run);
    secondSession.publish(1, () => snapshot());
    first.dispose();
    expect(window.__SVG_MODIFIER_CAPTURE_V1__).toBe(secondHook);
    expect(first.read()).toMatchObject({ status: 'idle', identity: null });
    expect(receiver.read().status).toBe('terminal-ok');
  });

  it('[R16] does not run a factory with a malformed generation before begin', () => {
    const session = connect();
    let builds = 0;
    for (const generation of [undefined, null, NaN, Infinity, 0, -1, 0.5, '1']) {
      session.publish(generation as number, () => {
        builds++;
        return snapshot();
      });
    }
    expect(builds).toBe(0);
    expect(receiver.read().status).toBe('idle');
  });

  it('[R17] does not let reentrant validation overwrite a newer pending run', () => {
    receiver.dispose();
    let session: CaptureSessionV1;
    let original: SvgModifierSnapshotV1;
    receiver = installReceiver({
      panelId: 7,
      validate: (value) => {
        expect(value).not.toBe(original);
        expect(Object.isFrozen(value)).toBe(true);
        session.begin({ ...run, generation: 2 });
        return [];
      },
    });
    session = connect();
    original = snapshot();
    session.begin(run);
    session.publish(1, () => original);
    expect(receiver.read()).toMatchObject({ status: 'pending', generation: 2 });
  });

  it('[R18] replaces success with a safe fail for the same active run', () => {
    const session = connect();
    session.begin(run);
    session.publish(1, () => snapshot());
    session.fail(1, { code: 'unrecognized secret error', message: 'private failure' });
    expect(receiver.read()).toMatchObject({ status: 'terminal-error', error: { code: 'CAPTURE_EXPORT_FAILED' } });
    expect(receiver.read().snapshot).toBeUndefined();
  });

  it('[R19] does not overwrite a same-run failure raised synchronously by the factory', () => {
    const session = connect();
    session.begin(run);
    session.publish(1, () => {
      session.fail(1, { code: 'CAPTURE_DATA_STATE_UNSUPPORTED', message: 'not ready' });
      return snapshot();
    });
    expect(receiver.read()).toMatchObject({
      status: 'terminal-error',
      error: { code: 'CAPTURE_DATA_STATE_UNSUPPORTED' },
    });
  });

  it('[R20] does not read failure message getters or expose validation exceptions', () => {
    receiver.dispose();
    receiver = installReceiver({
      panelId: 7,
      validate: () => {
        throw new Error('private validation stack');
      },
    });
    const session = connect();
    session.begin(run);
    session.publish(1, () => snapshot());
    expect(receiver.read().error?.code).toBe('CAPTURE_PAYLOAD_INVALID');
    expect(JSON.stringify(receiver.read())).not.toContain('private');
    let reads = 0;
    session.fail(
      1,
      Object.defineProperty({ code: 'CAPTURE_EXPORT_FAILED' }, 'message', {
        get: () => {
          reads++;
          throw new Error('private message');
        },
      }) as { code: string; message: string }
    );
    expect(reads).toBe(0);
    expect(receiver.read().error?.code).toBe('CAPTURE_EXPORT_FAILED');
  });

  it.each([
    { label: 'traversal', length: 100001, maxPayloadBytes: 1024 * 1024 },
    { label: 'minimum JSON bytes', length: 15000, maxPayloadBytes: 20000 },
  ])('[R21] rejects oversized array by $label before enumerating keys', ({ length, maxPayloadBytes }) => {
    receiver.dispose();
    receiver = installReceiver({ panelId: 7, maxPayloadBytes });
    const session = connect();
    const value = snapshot();
    let enumerations = 0;
    value.metrics[0].settings.extra = new Proxy(new Array(length), {
      ownKeys() {
        enumerations++;
        throw new Error('array keys must not be enumerated');
      },
    });
    session.begin(run);
    session.publish(1, () => value);
    expect(receiver.read().error?.code).toBe('CAPTURE_PAYLOAD_TOO_LARGE');
    expect(receiver.read().snapshot).toBeUndefined();
    expect(enumerations).toBe(0);
  });
});
