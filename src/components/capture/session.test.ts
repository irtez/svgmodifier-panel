import { connectCapture, CaptureRuntime } from './session';
import type { CaptureIdentityV1, CaptureRunV1, CaptureSessionV1 } from './protocol';
import type { SvgModifierSnapshotV1 } from './models';
import { installReceiver } from './testing/receiver';

const time = { effectiveFromMs: 10, effectiveToMs: 20 };
const runtime = {} as CaptureRuntime;
function receiver(patch: Partial<CaptureSessionV1> = {}) {
  const identities: CaptureIdentityV1[] = [];
  const begins: CaptureRunV1[] = [];
  const errors: string[] = [];
  let closes = 0;
  const handle: CaptureSessionV1 = {
    protocolVersion: 1,
    maxPayloadBytes: 1024,
    begin: (run) => {
      begins.push(run);
    },
    publish: (_, build) => {
      build();
    },
    fail: (_, error) => {
      errors.push(error.code);
    },
    close: () => {
      closes++;
    },
    ...patch,
  };
  window.__SVG_MODIFIER_CAPTURE_V1__ = {
    connect: (identity) => {
      identities.push(identity);
      return handle;
    },
  };
  return {
    identities,
    begins,
    errors,
    get closes() {
      return closes;
    },
  };
}
afterEach(() => {
  delete window.__SVG_MODIFIER_CAPTURE_V1__;
});

it('[S01] без hook или с отказом receiver нет загрузки runtime', () => {
  let imports = 0;
  const load = async () => {
    imports++;
    return runtime;
  };
  expect(connectCapture(7, '1.4.0', load)).toBeNull();
  window.__SVG_MODIFIER_CAPTURE_V1__ = { connect: () => null };
  expect(connectCapture(7, '1.4.0', load)).toBeNull();
  expect(imports).toBe(0);
});

it('[S02] begin инвалидирует старый ticket до загрузки и публикации', async () => {
  const state = receiver();
  let imports = 0;
  const connection = connectCapture(7, '1.4.0', async () => {
    imports++;
    return runtime;
  })!;
  expect(connection).not.toBeNull();
  const first = connection.begin(time);
  const second = connection.begin({ effectiveFromMs: 30, effectiveToMs: 40 });
  let builds = 0;
  first.publish(() => {
    builds++;
    return {} as SvgModifierSnapshotV1;
  });
  expect(await first.load()).toBeNull();
  expect(await second.load()).toBe(runtime);
  expect(imports).toBe(1);
  expect(builds).toBe(0);
  expect(state.begins).toEqual([
    { generation: 1, ...time },
    { generation: 2, effectiveFromMs: 30, effectiveToMs: 40 },
  ]);
  expect(state.identities[0]).toMatchObject({ panelId: 7, producerId: 'svgmodifier-panel', producerVersion: '1.4.0' });
});

it('[S03] close/remount не воскрешает старый ticket после async import', async () => {
  const state = receiver();
  let resolve!: (value: CaptureRuntime) => void;
  const connection = connectCapture(
    7,
    '1.4.0',
    () =>
      new Promise((done) => {
        resolve = done;
      })
  )!;
  const ticket = connection.begin(time);
  const pending = ticket.load();
  connection.close();
  connection.close();
  resolve(runtime);
  expect(await pending).toBeNull();
  expect(ticket.current()).toBe(false);
  const next = connectCapture(7, '1.4.0')!;
  expect(state.identities[0].instanceId).not.toBe(state.identities[1].instanceId);
  expect(state.closes).toBe(1);
  next.close();
});

it.each(['getter', 'connect', 'protocol', 'limit', 'method'] as const)(
  '[S04] ошибка %s при подключении изолирована',
  (kind) => {
    let imports = 0;
    if (kind === 'getter') {
      Object.defineProperty(window, '__SVG_MODIFIER_CAPTURE_V1__', {
        configurable: true,
        get() {
          throw new Error('secret');
        },
      });
    } else if (kind === 'connect') {
      window.__SVG_MODIFIER_CAPTURE_V1__ = {
        connect: () => {
          throw new Error('secret');
        },
      };
    } else {
      receiver(
        kind === 'protocol'
          ? { protocolVersion: 2 as 1 }
          : kind === 'limit'
          ? { maxPayloadBytes: NaN }
          : { publish: null as any }
      );
    }
    expect(
      connectCapture(7, '1.4.0', async () => {
        imports++;
        return runtime;
      })
    ).toBeNull();
    expect(imports).toBe(0);
  }
);

it.each(['begin', 'publish', 'fail', 'close'] as const)('[S05] исключение handle.%s не выходит в UI', (method) => {
  const state = receiver({
    [method]: () => {
      throw new Error('private stack');
    },
  });
  const connection = connectCapture(7, '1.4.0')!;
  expect(connection).not.toBeNull();
  expect(() => {
    const ticket = connection.begin(time);
    ticket.publish(() => {
      throw new Error('private exporter');
    });
    ticket.fail();
    connection.close();
  }).not.toThrow();
  expect(state.errors).not.toContain('private stack');
});

it('[S06] ошибка lazy import завершает capture безопасной ошибкой', async () => {
  const state = receiver();
  const connection = connectCapture(7, '1.4.0', async () => {
    throw new Error('private path');
  })!;
  expect(await connection.begin(time).load()).toBeNull();
  expect(state.errors).toEqual(['CAPTURE_EXPORT_FAILED']);
});

it('[S07] callback от receiver после возврата publish не может исполнить exporter', () => {
  let saved!: () => SvgModifierSnapshotV1;
  receiver({
    publish: (_, build) => {
      saved = build;
    },
  });
  const ticket = connectCapture(7, '1.4.0')!.begin(time);
  let builds = 0;
  ticket.publish(() => {
    builds++;
    return {} as SvgModifierSnapshotV1;
  });
  expect(() => saved()).toThrow();
  expect(builds).toBe(0);
});

it('[S15] getter принятого handle бросает: закрываем его, чтобы remount не стал ambiguous', () => {
  const receiver = installReceiver({ panelId: 7 });
  const hook = window.__SVG_MODIFIER_CAPTURE_V1__!;
  const connect = hook.connect;
  window.__SVG_MODIFIER_CAPTURE_V1__ = {
    connect: (identity) => {
      const handle = connect(identity)!;
      return {
        ...handle,
        get protocolVersion(): 1 {
          throw new Error('broken getter');
        },
      };
    },
  };
  expect(connectCapture(7, '1.4.0')).toBeNull();
  window.__SVG_MODIFIER_CAPTURE_V1__ = hook;
  const healthy = connectCapture(7, '1.4.0')!;
  healthy.begin(time);
  expect(receiver.read().status).toBe('pending');
  healthy.close();
  receiver.dispose();
});
