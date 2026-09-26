import { DataFrameMap, Diagnostic } from '../models';
import { initializeConfig } from 'components/infrastructure/config/configSetup';
import { parseYamlConfig } from 'components/infrastructure/config/parsers';
import { buildPanelPresentation } from 'components/application/adapters/panelPresentation';
import { initSVG } from 'components/infrastructure/svg/updater';
import { evaluatePanel } from './evaluator';

const field = (value: string[]) => ({ values: new Map([['value', { values: value }]]) });

function run(data: DataFrameMap, ids = ['a', 'b', 'c'], contextDiagnostics: Diagnostic[] = [], condition = '') {
  const svg = initSVG(
    '<svg xmlns="http://www.w3.org/2000/svg"><g id="cell-a"><rect fill="blue"/></g><g id="cell-b"><rect fill="blue"/></g><g id="cell-c"><rect fill="blue"/></g></svg>',
    'disable'
  )!;
  const prepared = initializeConfig(
    svg,
    parseYamlConfig(`changes:
  - id: ${JSON.stringify(ids)}
    attributes:
      autoConfig: true
      tooltip: {show: true}
      metrics:
        queries:
          - refid: A
            ${condition ? `thresholds: [{value: 80, color: red, condition: '${condition}'}]` : ''}
          - refid: B
          - refid: C
        baseColor: green
        thresholds: [{value: 80, color: red}]
`)
  );
  const evaluation = evaluatePanel(prepared.rulesByElementId, data, { timeTo: 0, diagnostics: contextDiagnostics });
  const presentation = buildPanelPresentation(evaluation, prepared.elementsById, {
    mode: 'svg',
    notifySettings: { show: false, threshold: undefined },
  });
  presentation.operations!.forEach((operation) => operation());
  return {
    evaluation,
    presentation,
    colors: [...svg.querySelectorAll('rect')].map((rect) => rect.getAttribute('fill')),
  };
}

it.each([undefined, [], ['NaN']])('[C30,D13] ошибка A=%j не занимает место и не приписывается метрике B', (values) => {
  const data: DataFrameMap = new Map([
    ['B', field(['95'])],
    ['C', field(['10'])],
  ]);
  if (values) {
    data.set('A', field(values));
  }
  const { evaluation, presentation, colors } = run(data);
  expect(evaluation.elements.map((element) => element.winner?.refId)).toEqual(['B', 'C', undefined]);
  expect(colors).toEqual(['red', 'green', '#8e8e8e']);
  expect(evaluation.diagnostics).toEqual([
    expect.objectContaining({ source: expect.objectContaining({ refId: 'A' }), elementIds: [] }),
  ]);
  expect(presentation.tooltipContent?.[0]).toMatchObject({ queryData: [{ metric: '95' }] });
  expect(presentation.tooltipContent?.[0].diagnostics).toBeUndefined();
  expect(presentation.tooltipContent?.[2]).toMatchObject({ noData: true });
});

it('[C31] когда данных совсем нет, диагностика не теряется и все свободные индикаторы серые', () => {
  const { evaluation, presentation, colors } = run(new Map(), undefined, [
    { code: 'QUERY_ERROR', severity: 'error', message: 'Synthetic query error', source: { refId: 'A' } },
    { code: 'CALCULATION_ERROR', severity: 'error', message: 'Synthetic calculation error' },
  ]);
  expect(colors).toEqual(['#8e8e8e', '#8e8e8e', '#8e8e8e']);
  expect(evaluation.diagnostics?.map((item) => item.code)).toEqual(
    expect.arrayContaining(['QUERY_ERROR', 'CALCULATION_ERROR', 'MISSING_INPUT'])
  );
  expect(presentation.tooltipContent).toHaveLength(3);
  expect(presentation.tooltipContent?.every((item) => item.noData && !item.diagnostics?.length)).toBe(true);
});

it('[C32,D11] ошибка условия остаётся у назначенной метрики, её число не исключается из раскладки', () => {
  const { evaluation, presentation } = run(
    new Map([
      ['A', field(['95'])],
      ['B', field(['10'])],
      ['C', field(['20'])],
    ]),
    undefined,
    [],
    'hour => 22'
  );
  expect(evaluation.elements.map((element) => element.winner?.refId)).toEqual(['A', 'B', 'C']);
  expect(presentation.tooltipContent?.[0]).toMatchObject({
    queryData: [{ metric: '95' }],
    diagnostics: [{ code: 'INVALID_CONDITION', elementIds: ['cell-a'] }],
  });
  expect(presentation.tooltipContent?.[1].diagnostics).toBeUndefined();
  expect(evaluation.diagnostics).toEqual([
    expect.objectContaining({ code: 'INVALID_CONDITION', elementIds: ['cell-a'] }),
  ]);
});

it('[C33,C25] явный selector сохраняет привязку, оставшиеся autoConfig-индикаторы заполняются плотно', () => {
  const { evaluation, presentation, colors } = run(
    new Map([
      ['B', field(['95'])],
      ['C', field(['10'])],
    ]),
    ['a:@1', 'b', 'c']
  );
  expect(evaluation.elements.map((element) => element.winner?.refId)).toEqual([undefined, 'B', 'C']);
  expect(colors).toEqual(['#8e8e8e', 'red', 'green']);
  expect(presentation.tooltipContent?.[0].diagnostics?.[0]).toMatchObject({
    code: 'MISSING_INPUT',
    elementIds: ['cell-a'],
  });
  expect(presentation.tooltipContent?.[1].diagnostics).toBeUndefined();
  expect(evaluation.diagnostics).toEqual([expect.objectContaining({ elementIds: ['cell-a'] })]);
});

it('[C34] последний индикатор получает все оставшиеся результаты и цвет их победителя', () => {
  const data: DataFrameMap = new Map([
    [
      'A',
      {
        values: new Map([
          ['one', { values: ['10'] }],
          ['two', { values: ['20'] }],
        ]),
      },
    ],
    ['B', field(['95'])],
    ['C', field(['30'])],
  ]);
  const { evaluation, presentation, colors } = run(data, ['a', 'b']);
  expect(evaluation.elements.map((element) => element.rules[0].fields.map((item) => item.metricValue))).toEqual([
    [10],
    [20, 95, 30],
  ]);
  expect(colors).toEqual(['green', 'red', 'blue']); // Статичный c не входит в правило.
  expect(presentation.tooltipContent?.[1].queryData?.map((item) => item.metric)).toEqual(['20', '95', '30']);
});
