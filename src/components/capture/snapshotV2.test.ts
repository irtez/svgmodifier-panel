import { buildSnapshotV2 } from './snapshotV2';
import { config, evaluateFixture, graph, table } from './testing/evaluateFixture';
import { validateSnapshotV2 } from './testing/validateSnapshotV2';

afterEach(() => {
  document.body.replaceChildren();
});

it.each(['wrong', '[null, {refid: A}]', '{refid: A}'])(
  '[V28] malformed query declarations %s still export diagnostics',
  async (queries) => {
    const run = await evaluateFixture({ yaml: config(queries) });
    const snapshot = buildSnapshotV2({ ...run.input, root: null });
    expect(validateSnapshotV2(snapshot, { panelId: 7, maxPayloadBytes: 4 * 1024 * 1024 })).toEqual([]);
    expect(snapshot.diagnostics.length).toBeGreaterThan(0);
  }
);

it('[V29] two selectors from the same rule may select different winners for one target', async () => {
  const { snapshot } = await build({
    yaml: config('[{refid: A}, {refid: B}]').replace('id: a', 'id: ["a:@1", "a:@2"]'),
    frames: [graph('A', 'first', [1]), graph('B', 'second', [99])],
  });
  expect(snapshot.indicators[0].ruleResults).toHaveLength(2);
  const winner = snapshot.metrics.find((m) => m.id === snapshot.indicators[0].state.winnerMetricId);
  expect(winner?.scalar?.value).toBe(99);
});
const build = async (options: Parameters<typeof evaluateFixture>[0] = {}) => {
  const run = await evaluateFixture(options),
    // Layout is covered in Chromium; jsdom has no rendered SVG bounds.
    snapshot = buildSnapshotV2({ ...run.input, root: null });
  expect(validateSnapshotV2(snapshot, { panelId: 7, maxPayloadBytes: 4 * 1024 * 1024 })).toEqual([]);
  return { ...run, snapshot };
};

it('[V08] preserves raw precision, source metadata, selected threshold and missing input', async () => {
  const { snapshot } = await build();
  expect(snapshot.metrics).toHaveLength(2);
  expect(snapshot.metrics[0]).toMatchObject({
    label: 'Reading',
    availability: 'available',
    scalar: {
      value: 12.34567,
      displayValue: '12.35',
      color: { rgba: [255, 0, 0, 1] },
      level: 2,
      appliedThreshold: { index: 0, value: 10, operator: '>=' },
    },
    sources: [
      {
        refId: 'A',
        legend: 'latency',
        fieldName: 'latency',
        frameName: 'A frame',
        valueCount: 2,
        fromMs: 0,
        toMs: 1000,
        value: 12.34567,
      },
    ],
  });
  expect(snapshot.indicators[0].state.winnerMetricId).toBe(snapshot.metrics[0].id);
  expect(snapshot.metrics[1]).toMatchObject({ availability: 'unavailable', scalar: null });
  expect(snapshot.diagnostics.some((d) => d.code === 'MISSING_INPUT')).toBe(true);
});

it('[V09] shares the same repeated evaluation but keeps separate targets and assignments', async () => {
  const { snapshot } = await build({ yaml: config('[{refid: A}]').replace('id: a', 'id: [a, b]') });
  expect(snapshot.rules).toHaveLength(1);
  expect(snapshot.metrics).toHaveLength(1);
  expect(snapshot.metrics[0].indicatorIds).toEqual(['cell-a', 'cell-b']);
  expect(snapshot.indicators.map((i) => i.state.winnerMetricId)).toEqual([
    snapshot.metrics[0].id,
    snapshot.metrics[0].id,
  ]);
});

it('[V10] does not combine equal values from different queries or selection occurrences', async () => {
  const { snapshot } = await build({ yaml: config('[{refid: A}, {refid: A}]') });
  expect(snapshot.metrics).toHaveLength(2);
  const sum = await build({ yaml: config('[{refid: A, legend: latency, sum: Same}]') });
  expect(sum.snapshot.metrics).toHaveLength(2);
  expect(sum.snapshot.indicators[0].tooltip.metricIds).toHaveLength(2);
});

it('[V11] retains the cause of a red zero even when tooltip filters hide it', async () => {
  const yaml = config('[{refid: A}]').replace('value: 10', 'value: 0, operator: =');
  const { snapshot } = await build({ yaml, frames: [graph('A', 'zero', [0])], tooltip: { hideZeros: true } });
  expect(snapshot.indicators[0].state.color?.rgba).toEqual([255, 0, 0, 1]);
  expect(snapshot.indicators[0].tooltip.status).toBe('empty');
  expect(snapshot.indicators[0].tooltip.metricIds).toEqual([]);
  expect(snapshot.metrics[0].scalar?.value).toBe(0);
});

it('[V12] sorts duplicate labels by UI values without changing selected winner', async () => {
  const { snapshot } = await build({
    yaml: config('[{refid: A}, {refid: B}]'),
    frames: [graph('A', 'first', [95]), graph('B', 'second', [11])],
    tooltip: { sort: 'ascending' },
  });
  expect(snapshot.metrics.map((m) => m.label)).toEqual(['Reading', 'Reading']);
  expect(snapshot.indicators[0].tooltip.metricIds).toEqual([snapshot.metrics[1].id, snapshot.metrics[0].id]);
  expect(snapshot.indicators[0].state.winnerMetricId).toBe(snapshot.metrics[0].id);
});

it('[V13] keeps table source indices and reversed tooltip order after filtering duplicate labels', async () => {
  const { snapshot } = await build({
    yaml: config('[{refid: T, thresholdKey: Value, filter: {exclude: {Node: [drop]}}}]'),
    frames: [table()],
  });
  const t = snapshot.metrics[0].table!;
  expect(t.rows.map((r) => r.sourceIndex)).toEqual([1, 2]);
  expect(t.rows.map((r) => r.values)).toEqual([
    ['same', 95],
    ['same', 0],
  ]);
  expect(t.winningRowIndex).toBe(0);
  expect(snapshot.indicators[0].tooltip.tables).toMatchObject([
    { metricId: snapshot.metrics[0].id, rowIndices: [1, 0] },
  ]);
});

it('[V14] keeps unbound rule hints and links without inventing a calculated result', async () => {
  const { snapshot } = await build({
    yaml: config()
      .replace('id: a', 'id: missing-target')
      .replace('title: Service Alpha', 'title: Service Alpha\n    link: /d/details/view'),
  });
  expect(snapshot.indicators).toEqual([]);
  expect(snapshot.metrics).toEqual([]);
  expect(snapshot.rules).toHaveLength(1);
  expect(snapshot.rules[0].queries[0].refId).toBe('A');
  expect(snapshot.links[0].destination?.dashboardUid).toBe('details');
  expect(snapshot.diagnostics.some((d) => d.code === 'MISSING_ELEMENT')).toBe(true);
});

it('[V15] keeps expressions and hidden diagnostics independently of tooltip availability', async () => {
  const { snapshot } = await build({
    yaml: config('[{refid: F}]').replace('show: true', 'show: true, hideNoDataWarnings: true'),
    expressions: [
      { refId: 'F', expression: '$MISSING + 1' },
      { refId: 'UNUSED', expression: '1 / 0' },
    ],
  });
  expect(snapshot.expressions).toHaveLength(2);
  expect(snapshot.expressions[0].inputs[0].refId).toBe('MISSING');
  expect(snapshot.indicators[0].state.noData).toBe(true);
  expect(snapshot.indicators[0].tooltip.noData).toBe(true);
  expect(snapshot.indicators[0].tooltip.diagnosticIds).toEqual([]);
  expect(snapshot.diagnostics.map((d) => d.code)).toEqual(
    expect.arrayContaining(['MISSING_INPUT', 'NON_FINITE_VALUE'])
  );
});

it('[V16] stores malformed YAML as panel diagnostics, not a serialization failure', async () => {
  const { snapshot } = await build({ yaml: 'changes: [' });
  expect(snapshot.evaluationStatus).toBe('invalid_configuration');
  expect(snapshot.rules).toEqual([]);
  expect(snapshot.diagnostics[0].code).toBe('YAML_PARSE_ERROR');
});

it('[V17] does not change evaluator results, source precision or displayed tooltip', async () => {
  const captured = await evaluateFixture(),
    ordinary = await evaluateFixture({ capture: false });
  expect(captured.fields).toEqual(ordinary.fields);
  expect(captured.evaluation).toEqual(ordinary.evaluation);
  expect(captured.presentation.tooltipContent).toEqual(ordinary.presentation.tooltipContent);
  const snapshot = buildSnapshotV2(captured.input);
  const saved = JSON.stringify(snapshot);
  captured.input.evaluation.diagnostics!.push({ code: 'LATER', severity: 'warning', message: 'Later update' });
  expect(JSON.stringify(snapshot)).toBe(saved);
});
