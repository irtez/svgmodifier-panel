import { DataFrameMap } from '../models';
import { initializeConfig } from 'components/infrastructure/config/configSetup';
import { parseYamlConfig } from 'components/infrastructure/config/parsers';
import { buildPanelPresentation } from 'components/application/adapters/panelPresentation';
import { evaluatePanel } from './evaluator';
import { getMetricsData } from './dataHandler';
import { queriesFilter } from './queryFilter';

const combined = `[{refid: A, legend: '^worker-', sum: 'Total'}]`;
const series = (rows: Record<string, string[]>) => ({
  values: new Map(Object.entries(rows).map(([name, values]) => [name, { values }])),
});
const input = (): DataFrameMap =>
  new Map([
    ['A', series({ 'api-1': ['10'], 'api-2': ['20'] })],
    ['B', series({ 'worker-1': ['3'], 'worker-2': ['7'] })],
  ]);

function run(data = input(), queries = combined) {
  // Настоящий YAML-путь, включая совместное использование refid и legend.
  const prepared = initializeConfig(
    null,
    parseYamlConfig(`changes:
  - id: a
    attributes:
      tooltip: {show: true}
      metrics:
        queries: ${queries}
        calculation: last
        baseColor: green
        thresholds: [{value: 35, color: red}]
`)
  );
  const evaluation = evaluatePanel(prepared.rulesByElementId, data, { timeTo: 0, diagnostics: [] });
  const presentation = buildPanelPresentation(evaluation, new Map(), {
    mode: 'svg',
    notifySettings: { show: false, threshold: undefined },
  });
  return { evaluation, presentation, fields: evaluation.elements[0].rules[0].fields, prepared };
}

it('[C35] один query с refid/legend/sum возвращает две суммы, а не объединённую красную метрику', () => {
  const { evaluation, presentation, fields } = run();
  expect(fields.map((field) => field.metricValue)).toEqual([30, 10]);
  expect(fields.map((field) => field.counter)).toEqual([1, 1]);
  expect(evaluation.elements[0].winner).toMatchObject({ metricValue: 30, color: 'green', lvl: 0 });
  expect(presentation.tooltipContent?.[0].queryData?.map((field) => [field.label, field.metric])).toEqual([
    ['Total', '30'],
    ['Total', '10'],
  ]);
  expect(evaluation.diagnostics).toEqual([]);
});

it('[C36] пересекающиеся выборки сохраняют отдельные суммы, не складывая повторно один ряд в общий итог', () => {
  const { fields } = run(input(), `[{refid: A, legend: '^api-', sum: 'Total'}]`);
  expect(fields.map((field) => field.metricValue)).toEqual([30, 30]);
});

it('[C37] отдельные queries с sum сохраняют две суммы и свои номера', () => {
  const { fields } = run(input(), `[{refid: A, sum: 'API'}, {legend: '^worker-', sum: 'Workers'}]`);
  expect(fields.map((field) => [field.counter, field.label, field.metricValue])).toEqual([
    [1, 'API', 30],
    [2, 'Workers', 10],
  ]);
});

it('[C38] без sum оба ключа сохраняют прежний порядок отдельных рядов', () => {
  const { fields } = run(input(), `[{refid: A, legend: '^worker-'}]`);
  expect(fields.map((field) => [field.counter, field.label, field.metricValue])).toEqual([
    [1, 'api-1', 10],
    [1, 'api-2', 20],
    [1, 'worker-1', 3],
    [1, 'worker-2', 7],
  ]);
});

it.each([
  ['A', 'api-2', 10],
  ['B', 'worker-2', 30],
] as const)('[D17] пустое поле %s/%s исключает только свою неполную сумму', (refId, legend, remaining) => {
  const data = input();
  data.get(refId)!.values.get(legend)!.values = [];
  const { fields, evaluation } = run(data);
  expect(fields.map((field) => field.metricValue)).toEqual([remaining]);
  expect(evaluation.diagnostics).toEqual([
    expect.objectContaining({
      code: 'EMPTY_INPUT',
      source: expect.objectContaining({ refId, legend }),
      elementIds: ['cell-a'],
    }),
  ]);
});

it('[D18] отсутствующий refid не скрывает доступную сумму по legend', () => {
  const data = input();
  data.delete('A');
  const { fields, evaluation } = run(data);
  expect(fields.map((field) => field.metricValue)).toEqual([10]);
  expect(evaluation.diagnostics).toEqual([
    expect.objectContaining({ code: 'MISSING_INPUT', source: expect.objectContaining({ refId: 'A' }) }),
  ]);
});

it('[D19] отсутствие совпадений legend не удаляет сумму refid и не создаёт ноль', () => {
  const { fields, evaluation } = run(input(), `[{refid: A, legend: '^absent-', sum: 'Total'}]`);
  expect(fields.map((field) => field.metricValue)).toEqual([30]);
  expect(evaluation.diagnostics).toEqual([
    expect.objectContaining({ code: 'EMPTY_INPUT', source: expect.objectContaining({ legend: '^absent-' }) }),
  ]);
});

it('[D20] переполнение первой суммы не скрывает доступную вторую', () => {
  const data = input();
  data.set('A', series({ 'api-1': ['1e308'], 'api-2': ['1e308'] }));
  const { fields, evaluation } = run(data);
  expect(fields.map((field) => field.metricValue)).toEqual([10]);
  expect(evaluation.diagnostics).toEqual([
    expect.objectContaining({ code: 'NON_FINITE_VALUE', source: expect.objectContaining({ refId: 'A' }) }),
  ]);
});

it('[E05] раздельные суммы сохраняют исходную точность и настоящий ноль', () => {
  const { fields } = run(
    new Map([
      ['A', series({ 'api-1': ['0.004'], 'api-2': ['0.005'] })],
      ['B', series({ 'worker-1': ['0'] })],
    ])
  );
  expect(fields).toHaveLength(2);
  expect(fields[0].metricValue).toBeCloseTo(0.009, 12);
  expect(fields[0].displayValue).toBe('0.01');
  expect(fields[1].metricValue).toBe(0);
});

it('[C39] обе суммы относятся к одному selector, но занимают два места в autoConfig', () => {
  const data = input();
  const { prepared } = run(data);
  const metrics = prepared.rulesByElementId.get('cell-a')![0].attributes.metrics!;
  const candidates = getMetricsData(metrics, data);
  expect(queriesFilter(candidates, [1], 0, 1).fields?.map((field) => field.metricValue)).toEqual([30, 10]);
  expect(queriesFilter(candidates, [2], 0, 1).fields).toEqual([]);
  expect(queriesFilter(candidates, [], 0, 2, true).fields?.map((field) => field.metricValue)).toEqual([30]);
  expect(queriesFilter(candidates, [], 1, 2, true).fields?.map((field) => field.metricValue)).toEqual([10]);
});
