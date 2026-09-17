import { dateTime, FieldType, LoadingState, type PanelData, type TimeRange } from '@grafana/data';
import { parsePanelConfig } from '../infrastructure/config/parsers';
import { initializeConfig } from '../infrastructure/config/configSetup';
import { extractFields } from '../infrastructure/data/dataExtractor';
import { calculateExpressions } from '../domain/utils/calculations';
import { evaluatePanel } from '../domain/services/evaluator';
import { buildPanelPresentation } from '../application/adapters/panelPresentation';
import { EvaluationTrace } from './trace';
import { buildSnapshot, type SnapshotInput } from './snapshot';
import { validateSnapshot } from './testing/validateSnapshot';
import type { Expr } from 'types';

const range: TimeRange = { from: dateTime(0), to: dateTime(1000), raw: { from: '0', to: '1000' } };
const graph = (refId: string, name: string, values: unknown[], extra = {}): PanelData['series'][number] => ({
  refId,
  name: refId + ' frame',
  length: values.length,
  fields: [
    { name: 'time', type: FieldType.time, config: {}, values: values.map((_, i) => i * 1000) },
    { name, type: FieldType.number, config: { displayName: name }, labels: { node: 'alpha' }, values, ...extra },
  ],
});
const table = (values: unknown[] = [95, 0, null]): PanelData['series'][number] => ({
  refId: 'T',
  name: 'Table frame',
  length: 3,
  meta: { preferredVisualisationType: 'table' },
  fields: [
    { name: 'Node', type: FieldType.string, config: {}, values: ['a', 'b', 'c'] },
    { name: 'Value', type: FieldType.number, config: { displayName: 'Value' }, values },
    { name: 'Enabled', type: FieldType.boolean, config: {}, values: [true, false, null] },
  ],
});
const config = (queries = '[{refid: A}, {refid: MISSING}]', extra = '') => `changes:
- id: a
  attributes:
    title: Service Alpha
    tooltip: {show: false}
    metrics:
      queries: ${queries}
      label: Reading
      baseColor: green
      decimal: 2
      thresholds: [{value: 10, color: red, lvl: 2}]
      ${extra}
`;

async function run(
  yaml = config(),
  frames = [graph('A', 'latency_prfx7', [0, 12.34567])],
  expressions: Expr[] = [],
  svg: Document | null = null
) {
  const parsed = parsePanelConfig(yaml);
  const data: PanelData = { state: LoadingState.Done, timeRange: range, series: frames };
  async function evaluate(capture: boolean) {
    const trace = capture ? new EvaluationTrace(parsed.rules) : undefined;
    const prepared = initializeConfig(svg, parsed.rules, trace);
    const extracted = await extractFields(data, undefined, range, trace);
    const diagnostics = [...parsed.diagnostics, ...(prepared.diagnostics ?? [])];
    const enriched = await calculateExpressions(expressions, extracted, range, diagnostics, trace);
    const evaluation = evaluatePanel(prepared.rulesByElementId, enriched, { timeTo: 1000, diagnostics }, trace);
    const presentation = buildPanelPresentation(evaluation, new Map(), {
      mode: 'grid',
      notifySettings: { show: false, threshold: undefined },
    });
    return { trace, extracted, evaluation, presentation };
  }
  const ordinary = await evaluate(false);
  const captured = await evaluate(true);
  // Сравниваем весь прежний результат, а не только значение winner.
  expect(captured.extracted).toEqual(ordinary.extracted);
  expect(captured.evaluation).toEqual(ordinary.evaluation);
  expect(captured.presentation).toEqual(ordinary.presentation);
  const snapshotInput: SnapshotInput = {
    trace: captured.trace!,
    evaluation: captured.evaluation,
    panel: { id: 7, mode: 'grid', title: null },
    producerVersion: '1.4.0',
    observed: { generation: 1, dataState: 'Done', effectiveFromMs: 0, effectiveToMs: 1000, evaluatedAtMs: 1001 },
    configuration: { yamlStatus: parsed.status, svgStatus: 'not_evaluated' },
    evaluationStatus: parsed.status === 'invalid' ? 'invalid_configuration' : 'evaluated',
    diagram: {
      status: 'not_rendered',
      coordinateSpace: null,
      viewport: null,
      items: [],
      connections: [],
      diagnosticIds: [],
    },
  };
  const snapshot = buildSnapshot(snapshotInput);
  expect(validateSnapshot(snapshot, { panelId: 7, maxPayloadBytes: 1024 * 1024 })).toEqual([]);
  return {
    snapshot,
    captured,
    ordinary,
    rebuild: (overrides: Partial<SnapshotInput> = {}) => buildSnapshot({ ...snapshotInput, ...overrides }),
  };
}

it('[X01] сохраняет исходные имена/точность и missing input, не меняя расчёт и tooltip', async () => {
  const { snapshot } = await run();
  expect(snapshot.metrics).toHaveLength(2);
  expect(snapshot.metrics[0]).toMatchObject({
    label: 'Reading',
    availability: 'available',
    scalar: { value: 12.34567, displayValue: '12.35', color: 'red', level: 2 },
    sources: [
      {
        refId: 'A',
        legend: 'latency_prfx7',
        fieldName: 'latency_prfx7',
        frameName: 'A frame',
        valueCount: 2,
        fromMs: 0,
        toMs: 1000,
        value: 12.34567,
      },
    ],
  });
  expect(snapshot.metrics[1]).toMatchObject({ availability: 'unavailable', scalar: null });
  expect(snapshot.elements[0].winnerMetricId).toBe(snapshot.metrics[0].id);
  expect(snapshot.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'MISSING_INPUT' })]));
});

it('[X02] две суммы refid/legend сохраняют независимые входы и общий counter', async () => {
  const { snapshot } = await run(config('[{refid: A, legend: "^worker", sum: Total}]'), [
    graph('A', 'api-a', [10]),
    graph('A', 'api-b', [20]),
    graph('B', 'worker-a', [3]),
    graph('B', 'worker-b', [7]),
  ]);
  expect(snapshot.metrics.map((metric) => [metric.queryCounter, metric.scalar?.value])).toEqual([
    [1, 30],
    [1, 10],
  ]);
  expect(snapshot.metrics.map((metric) => metric.sources.map((source) => source.value))).toEqual([
    [10, 20],
    [3, 7],
  ]);
});

it('[X03] неполная сумма сохраняет причины и известные слагаемые без выдуманного числа', async () => {
  const { snapshot } = await run(config('[{refid: A, sum: Total}]'), [graph('A', 'one', [2]), graph('A', 'two', [])]);
  expect(snapshot.metrics[0]).toMatchObject({ availability: 'unavailable', scalar: null });
  expect(snapshot.metrics[0].sources.map((source) => source.value)).toEqual([2, null]);
});

it('[X04] таблица сохраняет raw типы, строку winner и след порогов', async () => {
  const { snapshot } = await run(config('[{refid: T}]', 'thresholdKey: Value'), [table()]);
  const result = snapshot.metrics[0].table!;
  expect(result.rows.map((row) => row.values)).toEqual([
    ['a', 95, true],
    ['b', 0, false],
    ['c', null, null],
  ]);
  expect(result.winningRowIndex).toBe(0);
  expect(result.rowFilterStatus).toBe('applied');
  expect(result.rows[0].decision).toMatchObject({ value: 95, level: 2, color: 'red', selectedThresholdIndex: 0 });
  expect(result.rows[2].decision).toBeNull();
});

it('[X05] read-only table не получает числового winner', async () => {
  const { snapshot } = await run(config('[{refid: T}]'), [table()]);
  expect(snapshot.metrics[0].table?.rows).toHaveLength(3);
  expect(snapshot.metrics[0].table?.winningRowIndex).toBeNull();
  expect(snapshot.elements[0].winnerMetricId).toBeNull();
});

it('[X06] ошибка всех строк не теряет таблицу и отличает NaN от исходного null', async () => {
  const { snapshot } = await run(config('[{refid: T}]', 'thresholdKey: Value'), [table([NaN, Infinity, null])]);
  expect(snapshot.metrics[0].availability).toBe('unavailable');
  const rows = snapshot.metrics[0].table!.rows;
  expect(rows.map((row) => row.values[1])).toEqual([null, null, null]);
  expect(rows.map((row) => row.cellIssues.length)).toEqual([1, 1, 0]);
});

it('[X07] condition: false и ошибка condition различаются при доступной метрике', async () => {
  const { snapshot } = await run(
    config('[{refid: A}]').replace(
      'thresholds: [{value: 10, color: red, lvl: 2}]',
      'thresholds: [{value: 0, color: red, condition: "false"}, {value: 0, color: yellow, condition: "$MISSING > 0"}]'
    )
  );
  expect(snapshot.metrics[0].scalar).toMatchObject({
    value: 12.34567,
    color: 'green',
    level: 0,
    selectedThresholdIndex: null,
  });
  expect(snapshot.metrics[0].scalar?.thresholdTrace.map((check) => check.condition)).toEqual(['false', 'error']);
  expect(snapshot.metrics[0].scalar?.thresholdTrace[1].inputs[0]).toMatchObject({
    refId: 'MISSING',
    availability: 'unavailable',
    value: null,
  });
});

it('[X08] формула и condition сохраняют неокруглённые входы', async () => {
  const { snapshot } = await run(
    config('[{refid: CALC}]').replace(
      'thresholds: [{value: 10, color: red, lvl: 2}]',
      'thresholds: [{value: 0, color: red, lvl: 0, condition: "$A:last > 0"}]'
    ),
    [graph('A', 'value', [0.004])],
    [{ refId: 'CALC', expression: '$A:last * 1000' }]
  );
  expect(snapshot.expressions[0]).toMatchObject({ value: 4, inputs: [{ value: 0.004 }] });
  expect(snapshot.metrics[0].scalar).toMatchObject({ value: 4, level: 0, color: 'red' });
  expect(snapshot.metrics[0].scalar?.thresholdTrace[0].inputs[0].value).toBe(0.004);
});

it('[X09] autoConfig назначает успехи, а неудачные попытки оставляет без элемента', async () => {
  const yaml = config().replace('id: a', 'id: [a, b]').replace('title: Service Alpha', 'autoConfig: true');
  const { snapshot } = await run(yaml);
  const missing = snapshot.metrics.filter((metric) => metric.availability === 'unavailable');
  expect(missing.length).toBeGreaterThan(0);
  expect(missing.every((metric) => metric.elementIds.length === 0)).toBe(true);
  expect(snapshot.elements[0].winnerMetricId).not.toBeNull();
  expect(snapshot.elements[1].noData).not.toBeNull();
});

it('[X10] сломанный YAML возвращает завершённый снимок с ошибкой', async () => {
  const { snapshot } = await run('changes: [');
  expect(snapshot.evaluationStatus).toBe('invalid_configuration');
  expect(snapshot.metrics).toEqual([]);
  expect(snapshot.diagnostics[0].code).toBe('YAML_PARSE_ERROR');
});

it('[X11] опубликованный снимок не зависит от последующих мутаций данных', async () => {
  const { snapshot, captured } = await run();
  const before = JSON.stringify(snapshot);
  captured.evaluation.elements[0].winner!.color = 'blue';
  captured.extracted.clear();
  expect(JSON.stringify(snapshot)).toBe(before);
});

it.each([0, 95])('[X12] настоящий %s остаётся доступным, в отличие от полного no-data', async (value) => {
  const { snapshot } = await run(config('[{refid: A}]'), [graph('A', 'value', [value])]);
  expect(snapshot.metrics[0].scalar?.value).toBe(value);
  expect(snapshot.elements[0].noData).toBeNull();
  const absent = await run(config('[{refid: A}]'), []);
  expect(absent.snapshot.elements[0].noData).not.toBeNull();
  expect(absent.snapshot.metrics[0].scalar).toBeNull();
});

it('[X13] отдельные подготовленные варианты сохраняют авторский массив ссылок', async () => {
  const { snapshot } = await run(
    config('[{refid: A}]')
      .replace('id: a', 'id: [a, b]')
      .replace('title: Service Alpha', 'link: ["/d/first?from=now-1h", "/d/second?var-node=b"]')
  );
  const rules = snapshot.configuration.rules;
  expect(rules.map((rule) => rule.attributes.link)).toEqual(['/d/first?from=now-1h', '/d/second?var-node=b']);
  expect(rules.map((rule) => rule.authoredAttributes.link)).toEqual([
    ['/d/first?from=now-1h', '/d/second?var-node=b'],
    ['/d/first?from=now-1h', '/d/second?var-node=b'],
  ]);
});

it('[X14] не найденное правило остаётся с диагностикой, без фиктивного элемента/расчёта', async () => {
  const svg = new DOMParser().parseFromString(
    '<svg xmlns="http://www.w3.org/2000/svg"><rect id="cell-other"/></svg>',
    'image/svg+xml'
  );
  const { snapshot } = await run(config(), [graph('A', 'value', [95])], [], svg);
  expect(snapshot.elements).toEqual([]);
  expect(snapshot.metrics).toEqual([]);
  expect(snapshot.configuration.rules[0].elementIds).toEqual([]);
  expect(snapshot.diagnostics[0]).toMatchObject({
    code: 'MISSING_ELEMENT',
    elementIds: [],
    ruleIds: [snapshot.configuration.rules[0].id],
  });
});

it('[X15] фильтрация таблицы сохраняет исходный индекс и победителя массива ответа', async () => {
  const { snapshot } = await run(config('[{refid: T, filter: {include: {Node: ["b"]}}}]', 'thresholdKey: Value'), [
    table(),
  ]);
  expect(snapshot.metrics[0].table?.rows).toHaveLength(1);
  expect(snapshot.metrics[0].table?.rows[0]).toMatchObject({ sourceIndex: 1, values: ['b', 0, false] });
  expect(snapshot.metrics[0].table?.winningRowIndex).toBe(0);
});

it('[X16] ранняя ошибка выбора колонки не теряет известные raw строки', async () => {
  const { snapshot } = await run(config('[{refid: T}]', 'thresholdKey: unknown'), [table()]);
  expect(snapshot.metrics[0].availability).toBe('unavailable');
  expect(snapshot.metrics[0].table?.rowFilterStatus).toBe('not_evaluated');
  expect(snapshot.metrics[0].table?.rows.map((row) => row.values)).toEqual([
    ['a', 95, true],
    ['b', 0, false],
    ['c', null, null],
  ]);
});

it('[X17] сборка снимка не исполняет формулу повторно', async () => {
  Reflect.set(globalThis, '__captureExecutionCount', 0);
  try {
    const { snapshot } = await run(
      config('[{refid: CALC}]'),
      [graph('A', 'value', [12])],
      [
        {
          refId: 'CALC',
          expression: '((globalThis.__captureExecutionCount += 1), $A:last)',
        },
      ]
    );
    expect(Reflect.get(globalThis, '__captureExecutionCount')).toBe(2);
    expect(snapshot.expressions[0].value).toBe(12);
  } finally {
    Reflect.deleteProperty(globalThis, '__captureExecutionCount');
  }
});

it('[X18] занятый refId формулы не выдаётся за вычисленный результат этой формулы', async () => {
  const { snapshot } = await run(
    config('[{refid: A}]'),
    [graph('A', 'value', [12])],
    [{ refId: 'A', expression: '999' }]
  );
  expect(snapshot.expressions[0]).toMatchObject({ availability: 'unavailable', value: null, inputs: [] });
  expect(snapshot.metrics[0].scalar?.value).toBe(12);
  expect(snapshot.diagnostics).toEqual(
    expect.arrayContaining([expect.objectContaining({ code: 'EXPRESSION_NOT_EVALUATED' })])
  );
});

it('[X19] неверный title остаётся в settings, но не ломает JSON-тип результата', async () => {
  const { snapshot } = await run(config('[{refid: A}]', 'title: 123'));
  expect(snapshot.metrics[0].settings.title).toBe(123);
  expect(snapshot.metrics[0].title).toBeNull();
});

it('[X20] число использованных значений и время фиксируются при расчёте, не при сериализации', async () => {
  const { snapshot, captured, rebuild } = await run();
  const field = captured.extracted.get('A')!.values.values().next().value!;
  field.values.push('99');
  field.timestamps!.push(9999);
  const again = rebuild();
  expect(again.metrics[0].sources[0]).toEqual(snapshot.metrics[0].sources[0]);
});

it('[X21] condition с побочным эффектом не вызывается при повторной сборке', async () => {
  Reflect.set(globalThis, '__captureConditionCount', 0);
  try {
    const { snapshot, rebuild } = await run(
      config('[{refid: A}]').replace(
        'thresholds: [{value: 10, color: red, lvl: 2}]',
        'thresholds: [{value: 0, color: red, condition: "((globalThis.__captureConditionCount += 1), true)"}]'
      )
    );
    expect(Reflect.get(globalThis, '__captureConditionCount')).toBe(2);
    expect(rebuild()).toEqual(snapshot);
    expect(rebuild()).toEqual(snapshot);
    expect(Reflect.get(globalThis, '__captureConditionCount')).toBe(2);
  } finally {
    Reflect.deleteProperty(globalThis, '__captureConditionCount');
  }
});

it('[X22] вложенная raw-ячейка не меняется между расчётом и сериализацией', async () => {
  const cell = { status: ['old'] };
  const frame = table();
  frame.fields[2].values[0] = cell;
  const { snapshot, rebuild } = await run(config('[{refid: T}]'), [frame]);
  cell.status[0] = 'new';
  expect(rebuild().metrics[0].table!.rows[0].values[2]).toEqual({ status: ['old'] });
  expect(rebuild()).toEqual(snapshot);
});

it('[X23] неизвестный reducer сохраняет декларацию и фактически применённый last', async () => {
  const { snapshot } = await run(config('[{refid: A}]', 'calculation: unknown'));
  expect(snapshot.metrics[0].settings.calculation).toBe('unknown');
  expect(snapshot.metrics[0].sources[0].calculation).toBe('last');
  expect(snapshot.metrics[0].scalar?.value).toBe(12.34567);
});

it('[X24] query без selector не выдаётся за попытку выбора legend', async () => {
  const { snapshot } = await run(config('[{label: MissingSelector}]'));
  expect(snapshot.metrics[0]).toMatchObject({
    selection: 'none',
    kind: 'unresolved',
    sources: [],
    selectors: { refId: null, legend: null },
  });
});

it('[X25] технический отказ после частичного расчёта не оставляет висячие назначения', async () => {
  const { rebuild } = await run();
  const failed = rebuild({
    evaluationStatus: 'failed',
    evaluation: {
      elements: [],
      diagnostics: [{ code: 'EVALUATION_ERROR', severity: 'error', message: 'Synthetic failure' }],
    },
  });
  expect(validateSnapshot(failed, { panelId: 7, maxPayloadBytes: 1024 * 1024 })).toEqual([]);
  expect(failed.evaluationStatus).toBe('failed');
  expect(failed.elements).toEqual([]);
  expect(failed.metrics.every((metric) => metric.elementIds.length === 0)).toBe(true);
});

it('[X26] источник ошибки содержит известные индексы query и не приписывается чужой метрике', async () => {
  const { snapshot } = await run();
  const missing = snapshot.diagnostics.find((item) => item.code === 'MISSING_INPUT')!;
  expect(missing.source).toMatchObject({ metricsIndex: 0, queryIndex: 1, refId: 'MISSING' });
  expect(missing.metricIds).toEqual([snapshot.metrics[1].id]);
});

it('[X27] explicit selectors сохраняют реальные назначения query', async () => {
  const { snapshot } = await run(config('[{refid: A}, {refid: B}]').replace('id: a', 'id: ["a:@2", "b:@1"]'), [
    graph('A', 'first', [12]),
    graph('B', 'second', [95]),
  ]);
  expect(
    snapshot.elements.map((element) => [
      element.id,
      snapshot.metrics.find((metric) => metric.id === element.winnerMetricId)?.sources[0].refId,
    ])
  ).toEqual([
    ['cell-a', 'B'],
    ['cell-b', 'A'],
  ]);
  expect(snapshot.elements.map((element) => element.ruleResults[0].metricIds.length)).toEqual([1, 1]);
});

it('[X28] regex сохраняет фактически найденные SVG IDs и исходный selector', async () => {
  const svg = new DOMParser().parseFromString(
    '<svg xmlns="http://www.w3.org/2000/svg"><rect id="cell-a"/><rect id="cell-b"/></svg>',
    'image/svg+xml'
  );
  const { snapshot } = await run(
    config('[{refid: A}]').replace('id: a', 'id: "cell-.*"'),
    [graph('A', 'value', [12])],
    [],
    svg
  );
  expect(snapshot.elements.map((element) => element.id)).toEqual(['cell-a', 'cell-b']);
  expect(snapshot.configuration.rules.map((rule) => rule.selector)).toEqual(['cell-.*', 'cell-.*']);
});

it('[X29] независимые autoConfig-правила не склеивают разные серии одного значка', async () => {
  const first = config('[{refid: A1}, {refid: A2}]')
    .replace('id: a', 'id: [a, b]')
    .replace('title: Service Alpha', 'autoConfig: true');
  const second = config('[{refid: B1}, {refid: B2}]')
    .replace('id: a', 'id: [a, b]')
    .replace('title: Service Alpha', 'autoConfig: true');
  const { snapshot } = await run(first + second.replace('changes:\n', '\n'), [
    graph('A2', 'shifted', [2]),
    graph('B1', 'first', [5]),
    graph('B2', 'second', [8]),
  ]);
  expect(
    snapshot.elements.map((element) =>
      element.ruleResults.map((result) =>
        result.metricIds.map((id) => snapshot.metrics.find((metric) => metric.id === id)!.sources[0].refId)
      )
    )
  ).toEqual([
    [['A2'], ['B1']],
    [[], ['B2']],
  ]);
  expect(
    snapshot.metrics.filter((metric) => metric.selectors.refId === 'A1').every((metric) => !metric.elementIds.length)
  ).toBe(true);
});

it.each(['empty', 'ambiguous'])('[X30] %s table сохраняет причину и уже известные данные', async (kind) => {
  const frame = table();
  if (kind === 'empty') {
    frame.length = 0;
    frame.fields.forEach((field) => {
      field.values = [];
    });
  } else {
    frame.fields[1].config.displayName = 'ValueOne';
    frame.fields.push({
      name: 'ValueTwo',
      type: FieldType.number,
      config: { displayName: 'ValueTwo' },
      values: [1, 2, 3],
    });
  }
  const { snapshot } = await run(config('[{refid: T}]', 'thresholdKey: Value'), [frame]);
  expect(snapshot.metrics[0].availability).toBe('unavailable');
  expect(snapshot.metrics[0].table?.rows).toHaveLength(kind === 'empty' ? 0 : 3);
  expect(
    snapshot.diagnostics.some((item) => item.code === (kind === 'empty' ? 'EMPTY_INPUT' : 'AMBIGUOUS_FIELD'))
  ).toBe(true);
});

it('[X31] равные уровни сохраняют первого winner, а внутри метрики — последний совпавший порог', async () => {
  const { snapshot } = await run(config('[{refid: A}, {refid: B}]'), [
    graph('A', 'first', [12]),
    graph('B', 'second', [95]),
  ]);
  expect(snapshot.elements[0].winnerMetricId).toBe(snapshot.metrics[0].id);
  const last = await run(
    config('[{refid: A}]').replace(
      'thresholds: [{value: 10, color: red, lvl: 2}]',
      'thresholds: [{value: 10, color: red, lvl: 2}, {value: 0, color: green, lvl: 0}]'
    )
  );
  expect(last.snapshot.metrics[0].scalar).toMatchObject({ level: 0, color: 'green', selectedThresholdIndex: 1 });
});
