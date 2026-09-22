import React, { useRef } from 'react';
import { render, waitFor } from '@testing-library/react';
import { LoadingState, PanelData, TimeRange } from '@grafana/data';
import type { PanelOptions } from 'types';
import type { CaptureRunV1 } from './protocol';
import type { SvgModifierSnapshotV1 } from './models';
import { useCaptureSession, useCaptureCommit } from './useCaptureSession';
import { usePanelData } from '../application/hooks/usePanelData';
import { useSvgMount, useSvgUpdates } from '../presentation/components/svg/hooks/useSvgPanel';
import { validateSnapshot } from './testing/validateSnapshot';
import { data, options, range } from './testing/panelFixture';
import { installReceiver } from './testing/receiver';
import { EvaluationTrace } from './trace';

function receiver() {
  let latest: SvgModifierSnapshotV1 | undefined;
  let active = 0;
  const values: SvgModifierSnapshotV1[] = [];
  const errors: string[] = [];
  const starts: CaptureRunV1[] = [];
  window.__SVG_MODIFIER_CAPTURE_V1__ = {
    connect: () => ({
      protocolVersion: 1,
      maxPayloadBytes: 1024 * 1024,
      begin(run) {
        active = run.generation;
        latest = undefined;
        starts.push(run);
      },
      publish(generation, build) {
        if (generation !== active) {
          return;
        }
        latest = build();
        values.push(latest);
      },
      fail(_, error) {
        errors.push(error.code);
      },
      close() {
        latest = undefined;
      },
    }),
  };
  return {
    values,
    starts,
    errors,
    get latest() {
      return latest;
    },
  };
}
function Harness({
  input,
  opts,
  timeRange,
  width = 200,
  panelId = 7,
}: {
  input: PanelData;
  opts: PanelOptions;
  timeRange: TimeRange;
  width?: number;
  panelId?: number;
}) {
  const capture = useCaptureSession(panelId);
  const state = usePanelData(input, timeRange, opts, capture);
  const host = useRef<HTMLDivElement>(null);
  const root = useSvgMount(host, state.svgDoc);
  useSvgUpdates(state.processedData, root);
  useCaptureCommit(state.isCurrentResult ? state.processedData?.capture : undefined, root, width, 100);
  return (
    <>
      <div ref={host} />
      <output>{state.processedData?.tooltipContent[0]?.queryData?.[0]?.metric}</output>
    </>
  );
}
afterEach(() => {
  jest.restoreAllMocks();
  delete window.__SVG_MODIFIER_CAPTURE_V1__;
});

it('[S08] принятая session получает полный снимок того же расчёта после SVG operations', async () => {
  const state = receiver();
  const props = { input: data(), opts: options(), timeRange: range() };
  const ui = render(<Harness {...props} />);
  await waitFor(() => expect(ui.container.querySelector('output')?.textContent).toBe('95'));
  await waitFor(() => expect(state.latest).toBeDefined());
  expect(state.latest?.metrics[0].scalar?.value).toBe(95);
  expect(state.latest?.elements[0].title).toBeNull();
  expect(state.latest?.panel).toEqual({ id: 7, title: null, mode: 'svg' });
  expect(state.latest?.metrics[0].sources[0].fieldName).toBe('raw_alpha_metric');
  expect(validateSnapshot(state.latest, { panelId: 7, maxPayloadBytes: 1024 * 1024 })).toEqual([]);
  // jsdom не реализует SVGTextElement/layout; live label проверяется настоящим Chromium.
  expect(ui.container.querySelector('rect')?.getAttribute('fill')).toBe('red');
});

it('[S09] Loading/NotStarted инвалидирует terminal и не публикует старые frames', async () => {
  const state = receiver();
  const props = { input: data(), opts: options(), timeRange: range() };
  const ui = render(<Harness {...props} />);
  await waitFor(() => expect(state.latest).toBeDefined());
  for (const loading of [LoadingState.Loading, LoadingState.NotStarted]) {
    ui.rerender(<Harness {...props} input={{ ...props.input, state: loading }} />);
    expect(state.latest).toBeUndefined();
  }
  const newer = range(200000);
  ui.rerender(<Harness {...props} input={data(7, newer)} timeRange={newer} />);
  await waitFor(() => expect(state.latest?.metrics[0].scalar?.value).toBe(7));
  expect(state.latest?.observed.effectiveToMs).toBe(200000);
  expect(state.values.map((value) => value.metrics[0].scalar?.value)).toEqual([95, 7]);
});

it.each(['grid', 'yaml', 'svg', 'error'] as const)('[S10] %s имеет terminal без ожидания SVG', async (kind) => {
  const state = receiver();
  const opts = options();
  const input = data();
  if (kind === 'grid') {
    opts.displayMode = 'grid';
  }
  if (kind === 'yaml') {
    opts.jsonData.metricsMapping[0].code = 'changes: [';
  }
  if (kind === 'svg') {
    opts.jsonData.svgCode = '<svg>';
  }
  if (kind === 'error') {
    input.state = LoadingState.Error;
    input.errors = [{ refId: 'A', message: 'Synthetic failure' }];
  }
  render(<Harness input={input} opts={opts} timeRange={range()} />);
  await waitFor(() => expect(state.latest).toBeDefined());
  expect(validateSnapshot(state.latest, { panelId: 7, maxPayloadBytes: 1024 * 1024 })).toEqual([]);
  if (kind === 'yaml' || kind === 'svg') {
    expect(state.latest?.evaluationStatus).toBe('invalid_configuration');
  }
  if (kind === 'error') {
    expect(state.latest?.observed.dataState).toBe('Error');
  }
  if (kind === 'grid') {
    expect(state.latest?.diagram.status).toBe('not_rendered');
  }
});

it('[S11] Streaming завершает только capture ошибкой, UI продолжает обновление', async () => {
  const state = receiver();
  const opts = options();
  const input = { ...data(), state: LoadingState.Streaming };
  const ui = render(<Harness input={input} opts={opts} timeRange={range()} />);
  await waitFor(() => expect(ui.container.querySelector('output')?.textContent).toBe('95'));
  expect(state.errors).toEqual(['CAPTURE_DATA_STATE_UNSUPPORTED']);
  expect(state.latest).toBeUndefined();
});

it('[S12] замена YAML после mount использует текущие SVG элементы', async () => {
  const state = receiver();
  const props = { input: data(), opts: options(), timeRange: range() };
  const ui = render(<Harness {...props} />);
  await waitFor(() => expect(state.latest).toBeDefined());
  const opts = options();
  opts.jsonData.metricsMapping[0].code = opts.jsonData.metricsMapping[0].code.replace('color: red', 'color: orange');
  ui.rerender(<Harness {...props} opts={opts} />);
  await waitFor(() => expect(state.latest?.metrics[0].scalar?.color).toBe('orange'));
  expect(ui.container.querySelector('rect')?.getAttribute('fill')).toBe('orange');
});

it('[S13] StrictMode/remount корректно монтирует SVG и закрывает старую session', async () => {
  const state = receiver();
  const props = { input: data(), opts: options(), timeRange: range() };
  const ui = render(
    <React.StrictMode>
      <Harness {...props} />
    </React.StrictMode>
  );
  await waitFor(() => expect(state.latest).toBeDefined());
  expect(ui.container.querySelector('rect')?.getAttribute('fill')).toBe('red');
  ui.unmount();
  expect(state.latest).toBeUndefined();
});

it('[S14] resize публикует новое поколение через строгий receiver без повторной формулы', async () => {
  const receiver = installReceiver({
    panelId: 7,
    validate: (value) => validateSnapshot(value, { panelId: 7, maxPayloadBytes: 1024 * 1024 }),
  });
  const opts = options();
  Reflect.set(globalThis, '__captureExecutionCount', 0);
  opts.transformations.expressions = [
    { refId: 'CALC', expression: '((globalThis.__captureExecutionCount += 1), $A:last)' },
  ];
  const props = { input: data(), opts, timeRange: range() };
  try {
    const ui = render(<Harness {...props} />);
    await waitFor(() => expect(receiver.read().status).toBe('terminal-ok'));
    const first = receiver.read().generation!;
    ui.rerender(<Harness {...props} width={400} />);
    await waitFor(() => expect(receiver.read().generation).toBeGreaterThan(first));
    await waitFor(() => expect(receiver.read().status).toBe('terminal-ok'));
    expect(Reflect.get(globalThis, '__captureExecutionCount')).toBe(1);
    expect(receiver.read().snapshot?.observed.effectiveToMs).toBe(100000);
  } finally {
    receiver.dispose();
    Reflect.deleteProperty(globalThis, '__captureExecutionCount');
  }
});

it('[S16] смена только panelId начинает run нового instance при тех же данных', async () => {
  const state = receiver();
  const props = { input: data(), opts: options(), timeRange: range() };
  const ui = render(<Harness {...props} />);
  await waitFor(() => expect(state.latest?.panel.id).toBe(7));
  ui.rerender(<Harness {...props} panelId={8} />);
  await waitFor(() => expect(state.latest?.panel.id).toBe(8));
});

it.each(['recordField', 'beginRule'] as const)(
  '[S17] ошибка recorder.%s не меняет UI и не повторяет расчёт',
  async (method) => {
    const state = receiver();
    jest.spyOn(EvaluationTrace.prototype, method).mockImplementation(() => {
      throw new Error('recorder failed');
    });
    const ui = render(<Harness input={data()} opts={options()} timeRange={range()} />);
    await waitFor(() => expect(ui.container.querySelector('output')?.textContent).toBe('95'));
    expect(ui.container.querySelector('rect')?.getAttribute('fill')).toBe('red');
    expect(state.latest).toBeUndefined();
    expect(state.errors).toEqual(['CAPTURE_EXPORT_FAILED']);
  }
);

it('[S18] ошибка capture-only request metadata не отменяет успешные метрики', async () => {
  const state = receiver();
  const input = data();
  input.request = {
    get targets() {
      throw new Error('metadata failed');
    },
  } as any;
  const ui = render(<Harness input={input} opts={options()} timeRange={range()} />);
  await waitFor(() => expect(ui.container.querySelector('output')?.textContent).toBe('95'));
  expect(ui.container.querySelector('rect')?.getAttribute('fill')).toBe('red');
  expect(state.errors).toEqual(['CAPTURE_EXPORT_FAILED']);
});

it('[S19] смена исходного SVG в grid инвалидирует старый рисунок', async () => {
  const receiver = installReceiver({ panelId: 7 });
  const opts = options();
  opts.displayMode = 'grid';
  const props = { input: data(), opts, timeRange: range() };
  try {
    const ui = render(<Harness {...props} />);
    await waitFor(() => expect(receiver.read().status).toBe('terminal-ok'));
    const first = receiver.read().generation!;
    ui.rerender(
      <Harness
        {...props}
        opts={{
          ...opts,
          jsonData: {
            ...opts.jsonData,
            svgCode: opts.jsonData.svgCode.replace('Service Alpha', 'Service Beta'),
          },
        }}
      />
    );
    await waitFor(() => expect(receiver.read().generation).toBeGreaterThan(first));
    await waitFor(() => expect(receiver.read().status).toBe('terminal-ok'));
    expect(receiver.read().snapshot?.diagram.items.some((item) => item.authoredText === 'Service Beta')).toBe(true);
  } finally {
    receiver.dispose();
  }
});
