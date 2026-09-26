import { dateTime, FieldType, LoadingState, type PanelData } from '@grafana/data';
import { parsePanelConfig } from 'components/infrastructure/config/parsers';
import { initializeConfig } from 'components/infrastructure/config/configSetup';
import { extractFields } from 'components/infrastructure/data/dataExtractor';
import { evaluatePanel } from 'components/domain/services/evaluator';
import { calculateExpressions } from 'components/domain/utils/calculations';
import type { Diagnostic, QueryType } from 'components/domain/models';
import type { Expr } from 'types';
import { buildPanelPresentation } from './panelPresentation';
import { tooltipDiagnostics } from './tooltipDiagnostics';
import { getMetricsData } from 'components/domain/services/dataHandler';

const range = { from: dateTime(0), to: dateTime(1000), raw: { from: '0', to: '1000' } };
const rule = (queries: QueryType[], hide?: unknown, extra = {}) => ({
  id: 'a',
  attributes: {
    tooltip: { show: true, ...(hide === undefined ? {} : { hideNoDataWarnings: hide }) },
    metrics: { queries, baseColor: 'green', thresholds: [{ value: 80, color: 'red', lvl: 1 }] },
    ...extra,
  },
});

async function run(
  rules = [rule([{ refid: 'A' }])],
  values: Record<string, unknown[]> = {},
  errors: Diagnostic[] = [],
  expressions: Expr[] = []
) {
  const parsed = parsePanelConfig(JSON.stringify({ changes: rules }));
  const prepared = initializeConfig(null, parsed.rules);
  const data: PanelData = {
    state: LoadingState.Done,
    timeRange: range,
    series: Object.entries(values).map(([refId, values]) => ({
      refId,
      length: values.length,
      fields: [
        { name: 'time', type: FieldType.time, config: {}, values: values.map((_, i) => i * 1000) },
        { name: refId, type: FieldType.number, config: {}, values },
      ],
    })),
  };
  const diagnostics = [...errors, ...parsed.diagnostics, ...(prepared.diagnostics ?? [])];
  const extracted = await extractFields(data, undefined, range);
  const enriched = await calculateExpressions(expressions, extracted, range, diagnostics);
  const evaluation = evaluatePanel(prepared.rulesByElementId, enriched, { timeTo: 1000, diagnostics });
  const before = JSON.stringify(evaluation);
  const result = buildPanelPresentation(evaluation, new Map(), {
    mode: 'svg',
    notifySettings: { show: false, threshold: undefined },
  });
  expect(JSON.stringify(evaluation)).toBe(before);
  return { evaluation, tooltip: result.tooltipContent?.[0], parsed };
}

it.each([undefined, false, true])('[N10] flag=%s не скрывает общий no-data и не удаляет API-причины', async (hide) => {
  const { evaluation, tooltip } = await run([rule([{ refid: 'A' }, { refid: 'B' }], hide)]);
  expect(evaluation.elements[0].noData).toBeDefined();
  expect(evaluation.diagnostics).toHaveLength(2);
  expect(tooltip?.noData).toBe(true);
  expect(tooltip?.diagnostics ?? []).toHaveLength(hide ? 0 : 2);
});

it('[N11] muted null не меняет красный winner, а неверное число остаётся ошибкой', async () => {
  const { evaluation, tooltip } = await run([rule([{ refid: 'A' }, { refid: 'B' }, { refid: 'C' }], true)], {
    A: [95],
    B: [null],
    C: ['abc'],
  });
  expect(evaluation.elements[0].winner).toMatchObject({ metricValue: 95, color: 'red' });
  expect(tooltip?.queryData?.[0].metric).toBe('95');
  expect(tooltip?.diagnostics?.map((d) => d.code)).toEqual(['NON_FINITE_VALUE']);
  expect(evaluation.diagnostics?.map((d) => d.code)).toEqual(['MISSING_VALUE', 'NON_FINITE_VALUE']);
});

it('[N12] флаг относится к своему правилу, а не к соседнему на том же элементе', async () => {
  const { tooltip } = await run([rule([{ refid: 'A' }], true), rule([{ refid: 'B' }], false)]);
  expect(tooltip?.diagnostics?.map((d) => d.source?.refId)).toEqual(['B']);
});

it.each(['true', 'false', 1])('[N13] невалидный flag=%s не скрывает предупреждения и диагностируется', async (hide) => {
  const { parsed, tooltip } = await run([rule([{ refid: 'A' }], hide)]);
  expect(parsed.diagnostics).toEqual([expect.objectContaining({ code: 'INVALID_TOOLTIP_SETTING' })]);
  expect(tooltip?.diagnostics?.map((d) => d.code)).toEqual(
    expect.arrayContaining(['MISSING_INPUT', 'INVALID_TOOLTIP_SETTING'])
  );
});

it.each([false, true])('[N14] показывает один timeout вместо его no-data последствий; flag=%s', async (hide) => {
  const error: Diagnostic = {
    code: 'QUERY_ERROR',
    severity: 'error',
    message: 'Synthetic timeout',
    source: { refId: 'A' },
  };
  const { evaluation, tooltip } = await run([rule([{ refid: 'A' }], hide)], {}, [error]);
  expect(tooltip?.diagnostics?.map((d) => d.code)).toEqual(['QUERY_ERROR']);
  expect(evaluation.diagnostics?.map((d) => d.code)).toEqual(expect.arrayContaining(['QUERY_ERROR', 'MISSING_INPUT']));
});

it.each([false, true])('[N15] цепочка G → F → A показывает первичную ошибку A, flag=%s', async (hide) => {
  const error: Diagnostic = {
    code: 'QUERY_ERROR',
    severity: 'error',
    message: 'Synthetic timeout',
    source: { refId: 'A' },
  };
  const { evaluation, tooltip } = await run(
    [rule([{ refid: 'G' }], hide)],
    {},
    [error],
    [
      { refId: 'F', expression: '$A + 1' },
      { refId: 'G', expression: '$F + 1' },
    ]
  );
  expect(tooltip?.diagnostics?.map((d) => d.code)).toEqual(['QUERY_ERROR']);
  expect(evaluation.diagnostics?.some((d) => d.source?.expressionRefId === 'F')).toBe(true);
  expect(evaluation.diagnostics?.some((d) => d.source?.expressionRefId === 'G')).toBe(true);
});

it('[N16] корректная формула без входа заглушается, неправильная формула — нет', async () => {
  const { tooltip } = await run(
    [rule([{ refid: 'F' }, { refid: 'G' }], true)],
    {},
    [],
    [
      { refId: 'F', expression: '$MISSING + 1' },
      { refId: 'G', expression: '$MISSING +' },
    ]
  );
  expect(tooltip?.diagnostics?.map((d) => d.code)).toEqual(['CALCULATION_ERROR']);
});

it('[N17] повторное использование одной ошибки не размножает tooltip', async () => {
  const error: Diagnostic = {
    code: 'QUERY_ERROR',
    severity: 'error',
    message: 'Synthetic timeout',
    source: { refId: 'A' },
  };
  const { tooltip } = await run([rule([{ refid: 'A' }, { refid: 'A' }]), rule([{ refid: 'A' }])], {}, [error]);
  expect(tooltip?.diagnostics).toHaveLength(1);
  expect(tooltip?.diagnostics?.[0].code).toBe('QUERY_ERROR');
});

it('[N18] некорректный фильтр и настройка расчёта остаются видимыми', async () => {
  const { tooltip } = await run(
    [
      rule(
        [
          { refid: 'A', filter: { include: { '': 'broken' } } } as unknown as QueryType,
          { refid: 'B', calculation: 'unknown' } as unknown as QueryType,
        ],
        true
      ),
    ],
    { A: [10], B: [20] }
  );
  expect(tooltip?.diagnostics?.map((d) => d.code)).toEqual(
    expect.arrayContaining(['INVALID_FILTER', 'UNKNOWN_CALCULATION'])
  );
});

it('[N19] autoConfig не переносит ошибку пропавшего A на занявший его место B', async () => {
  const item = rule([{ refid: 'A' }, { refid: 'B' }], false, { autoConfig: true });
  const { evaluation, tooltip } = await run([item], { B: [95] }, [
    { code: 'QUERY_ERROR', severity: 'error', message: 'Synthetic timeout', source: { refId: 'A' } },
  ]);
  expect(evaluation.elements[0].winner?.refId).toBe('B');
  expect(tooltip?.diagnostics ?? []).toEqual([]);
  expect(evaluation.diagnostics?.some((d) => d.code === 'QUERY_ERROR')).toBe(true);
});

it('[N23] явный tooltip.show=false сохраняется при наличии ошибок и отсутствии данных', async () => {
  const { evaluation, tooltip } = await run(
    [rule([{ refid: 'A' }, { refid: 'B' }], true, { tooltip: { show: false, hideNoDataWarnings: true } })],
    { B: ['abc'] }
  );
  expect(tooltip).toBeUndefined();
  expect(evaluation.diagnostics).toHaveLength(2);
});

it('[N24] ошибка источника без refId не скрывается у зависимого запроса', async () => {
  const { tooltip } = await run([rule([{ refid: 'A' }], true)], {}, [
    { code: 'QUERY_ERROR', severity: 'error', message: 'Synthetic global timeout' },
  ]);
  expect(tooltip?.diagnostics?.map((d) => d.code)).toEqual(['QUERY_ERROR']);
});

it('[N25] отключённое правило не добавляет ошибки в tooltip соседнего правила', async () => {
  const { tooltip } = await run(
    [rule([{ refid: 'A' }]), rule([{ refid: 'B' }], false, { tooltip: { show: false, hideNoDataWarnings: 'broken' } })],
    { A: [95], B: ['abc'] }
  );
  expect(tooltip?.queryData?.[0].metric).toBe('95');
  expect(tooltip?.diagnostics ?? []).toEqual([]);
});

it.each(['$MISSING + $B', '$B + $MISSING'])(
  '[N26] пропуск не скрывает ошибку другого входа формулы: %s',
  async (expression) => {
    const { tooltip, evaluation } = await run(
      [rule([{ refid: 'F' }], true)],
      { B: ['abc'] },
      [],
      [{ refId: 'F', expression }]
    );
    expect(tooltip?.diagnostics?.map((d) => d.code)).toContain('NON_FINITE_VALUE');
    expect(evaluation.diagnostics?.some((d) => d.code === 'MISSING_INPUT' && d.source?.refId === 'MISSING')).toBe(true);
  }
);

it('[N27] missing перед зависимостью с timeout не прячет timeout в формуле и условии', async () => {
  const error: Diagnostic = {
    code: 'QUERY_ERROR',
    severity: 'error',
    message: 'Synthetic timeout',
    source: { refId: 'B' },
  };
  const expression = '$MISSING + $B';
  const formula = await run([rule([{ refid: 'F' }], true)], {}, [error], [{ refId: 'F', expression }]);
  expect(formula.tooltip?.diagnostics?.map((d) => d.code)).toEqual(['QUERY_ERROR']);
  const threshold = rule([{ refid: 'A' }], true);
  Object.assign(threshold.attributes.metrics.thresholds[0], { condition: expression + ' > 1' });
  const condition = await run([threshold], { A: [95] }, [error]);
  expect(condition.tooltip?.diagnostics?.map((d) => d.code)).toEqual(['QUERY_ERROR']);
});

it.each([{}, { sum: 'Total' }])('[N33] частичный ответ сохраняет число и ошибку источника, query=%j', async (extra) => {
  const { evaluation, tooltip } = await run([rule([{ refid: 'A', ...extra }], true)], { A: [95] }, [
    { code: 'QUERY_ERROR', severity: 'error', message: 'Synthetic partial response', source: { refId: 'A' } },
  ]);
  expect(evaluation.elements[0].winner?.metricValue).toBe(95);
  expect(tooltip?.diagnostics?.map((d) => d.code)).toEqual(['QUERY_ERROR']);
});

it.each([false, true])('[N29] таблица без пригодных строк показывает причины без сводного повтора, flag=%s', (hide) => {
  const diagnostics: Diagnostic[] = [];
  const result = getMetricsData(
    [{ queries: [{ refid: 'T' }], thresholdKey: 'Value' }],
    new Map([['T', { type: 'table', length: 2, values: new Map([['Value', { values: [null, 'abc'] }]]) }]]),
    undefined,
    { timeTo: 1000, diagnostics }
  );
  expect(result.tables).toEqual([]);
  expect(diagnostics.map((d) => d.code)).toEqual(['MISSING_VALUE', 'NON_FINITE_VALUE', 'EMPTY_INPUT']);
  expect(tooltipDiagnostics(diagnostics, hide).map((d) => d.code)).toEqual(
    hide ? ['NON_FINITE_VALUE'] : ['MISSING_VALUE', 'NON_FINITE_VALUE']
  );
});
