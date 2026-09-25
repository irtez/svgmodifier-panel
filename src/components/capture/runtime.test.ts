import { createPublication } from './runtime';
import { connectCapture } from './session';
import { evaluateFixture } from './testing/evaluateFixture';
import { buildSnapshotV2 } from './snapshotV2';
import type { SvgModifierSnapshotV2 } from './modelsV2';

afterEach(() => {
  delete window.__SVG_MODIFIER_CAPTURE_V2__;
  Reflect.deleteProperty(document, 'fonts');
  document.body.replaceChildren();
});
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
function hook(limit: number) {
  const published: SvgModifierSnapshotV2[] = [],
    errors: string[] = [];
  window.__SVG_MODIFIER_CAPTURE_V2__ = {
    connect: () => ({
      protocolVersion: 2,
      maxPayloadBytes: limit,
      begin() {},
      close() {},
      publish(_generation, build) {
        published.push(build());
      },
      fail(_generation, error) {
        errors.push(error.code);
      },
    }),
  };
  return { published, errors, connection: connectCapture(7, '1.4.0')! };
}

it('[S21] enforces the receiver UTF-8 limit exactly, with no private smaller limit', async () => {
  const { input } = await evaluateFixture();
  input.panel.title = 'éЖ字😀';
  input.root = null;
  const bytes = Buffer.byteLength(JSON.stringify(buildSnapshotV2(input)), 'utf8');
  for (const limit of [bytes, bytes - 1]) {
    const state = hook(limit),
      ticket = state.connection.begin(input.observed);
    createPublication(ticket, input).commit(null, 'a');
    await flush();
    expect(state.published.length).toBe(limit === bytes ? 1 : 0);
    expect(state.errors).toEqual(limit === bytes ? [] : ['CAPTURE_PAYLOAD_TOO_LARGE']);
    state.connection.close();
  }
});

it('[S22] waits for fonts and does not resurrect an obsolete generation', async () => {
  let ready!: () => void;
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      ready: new Promise<void>((resolve) => {
        ready = resolve;
      }),
    },
  });
  const { input } = await evaluateFixture(),
    state = hook(4 * 1024 * 1024);
  const first = state.connection.begin(input.observed);
  createPublication(first, input).commit(input.root, 'a');
  await flush();
  expect(state.published).toEqual([]);
  const second = state.connection.begin(input.observed);
  createPublication(second, input).commit(input.root, 'b');
  ready();
  await flush();
  expect(state.published.map((s) => s.observed.generation)).toEqual([2]);
  state.connection.close();
});

it('[S23] exposes a bounded traversal failure without leaking arbitrary exception text', async () => {
  const { input } = await evaluateFixture(),
    state = hook(4 * 1024 * 1024);
  let node = input.root!;
  for (let i = 0; i < 258; i++) {
    const next = node.ownerDocument.createElement('g');
    node.appendChild(next);
    node = next;
  }
  createPublication(state.connection.begin(input.observed), input).commit(input.root, 'a');
  await flush();
  expect(state.errors).toEqual(['CAPTURE_SVG_COMPLEXITY_LIMIT']);
  expect(state.published).toEqual([]);
  state.connection.close();
});
