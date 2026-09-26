import { dateTime, FieldType, LoadingState, type PanelData } from '@grafana/data';
import { extractFields } from 'components/infrastructure/data/dataExtractor';
import { getMetricsData } from './dataHandler';
import { calculateExpressions, evaluateThresholdCondition } from '../utils/calculations';
import type { CalculationMethod, Diagnostic } from '../models';

const range = { from: dateTime(0), to: dateTime(2000), raw: { from: '0', to: '2000' } };

async function input(values: unknown[], table = false, window?: string) {
  const data: PanelData = {
    state: LoadingState.Done,
    timeRange: range,
    series: [
      {
        refId: 'A',
        length: values.length,
        meta: { preferredVisualisationType: table ? 'table' : 'graph' },
        fields: [
          ...(!table
            ? [{ name: 'time', type: FieldType.time, config: {}, values: values.map((_, i) => i * 1000) }]
            : []),
          { name: 'value', type: FieldType.number, config: {}, values },
        ],
      },
    ],
  };
  return extractFields(data, window ? { global: window } : undefined, range);
}

async function calculate(values: unknown[], calculation: CalculationMethod, table = false) {
  const diagnostics: Diagnostic[] = [];
  const result = getMetricsData(
    [{ queries: [{ refid: 'A', calculation }], ...(table ? { thresholdKey: 'value' } : {}), baseColor: 'green' }],
    await input(values, table),
    undefined,
    { timeTo: 2000, diagnostics }
  );
  return { result, diagnostics };
}

it.each(['total', 'min', 'max', 'last', 'delta'] as CalculationMethod[])(
  '[N01] %s отличает actual null/undefined от неправильного числа без частичного результата',
  async (method) => {
    for (const missing of [null, undefined]) {
      const { result, diagnostics } = await calculate([10, missing], method);
      expect(result.fields).toEqual([]);
      expect(diagnostics).toEqual([expect.objectContaining({ code: 'MISSING_VALUE', severity: 'warning' })]);
    }
  }
);

it.each(['null', '', 'abc', NaN, Infinity, -Infinity])(
  '[N02] некорректное значение %s не становится no-data',
  async (value) => {
    const { result, diagnostics } = await calculate([10, value], 'total');
    expect(result.fields).toEqual([]);
    expect(diagnostics[0]).toMatchObject({ code: 'NON_FINITE_VALUE', severity: 'error' });
  }
);

it.each(['total', 'min', 'max'] as CalculationMethod[])(
  '[N03] %s не маскирует неверное число соседним null',
  async (method) => {
    const { diagnostics } = await calculate([null, NaN, 10], method);
    expect(diagnostics[0].code).toBe('NON_FINITE_VALUE');
  }
);

it.each([
  ['last', [null, 10], 10],
  ['delta', [10, null, 20], 10],
  ['count', [null, null], 2],
  ['last', [0], 0],
] as Array<[CalculationMethod, unknown[], number]>)(
  '[N04] %s сохраняет значение, когда пропуск не нужен расчёту',
  async (method, values, expected) => {
    const { result, diagnostics } = await calculate(values, method);
    expect(result.fields?.[0].metricValue).toBe(expected);
    expect(diagnostics).toEqual([]);
  }
);

it('[N05] total переполняется как настоящая ошибка, а пустой ряд остаётся no-data', async () => {
  expect((await calculate([1e308, 1e308], 'total')).diagnostics[0].code).toBe('NON_FINITE_VALUE');
  expect((await calculate([], 'total')).diagnostics[0]).toMatchObject({ code: 'EMPTY_INPUT', severity: 'warning' });
});

it('[N06] таблица различает пустую ячейку и мусор, сохраняя строки для отображения', async () => {
  const { result, diagnostics } = await calculate([null, 'null', 10], 'last', true);
  expect(diagnostics.map((d) => d.code)).toEqual(['MISSING_VALUE', 'NON_FINITE_VALUE']);
  expect(result.tables?.[0].columnsData.map((r) => r.row)).toEqual([['null'], ['null'], ['10']]);
  expect(result.tables?.[0].metricValue).toBe(10);
});

it('[N07] временной срез сохраняет null без подмены предыдущей точкой', async () => {
  const data = await input([10, 20, null], false, '0m');
  const diagnostics: Diagnostic[] = [];
  getMetricsData([{ queries: [{ refid: 'A' }] }], data, undefined, { timeTo: 2000, diagnostics });
  expect(diagnostics[0].code).toBe('MISSING_VALUE');
});

it('[N08] корректной формуле и условию может не хватать входных данных', async () => {
  const diagnostics: Diagnostic[] = [];
  const data = await input([null]);
  const result = await calculateExpressions([{ refId: 'F', expression: '$A + 1' }], data, range, diagnostics);
  expect(result.has('F')).toBe(false);
  expect(diagnostics[0]).toMatchObject({
    code: 'MISSING_VALUE',
    severity: 'warning',
    source: { expressionRefId: 'F', refId: 'A' },
  });
  const ctx = { timeTo: 2000, diagnostics: [] as Diagnostic[] };
  expect(evaluateThresholdCondition('$MISSING > 1', data, ctx)).toBe(false);
  expect(ctx.diagnostics[0]).toMatchObject({ code: 'MISSING_INPUT', severity: 'warning' });
});

it.each(['$MISSING +', '$MISSING + 010'])(
  '[N09] пропавший вход не скрывает синтаксическую ошибку: %s',
  async (expression) => {
    const diagnostics: Diagnostic[] = [];
    await calculateExpressions([{ refId: 'F', expression }], new Map(), range, diagnostics);
    expect(diagnostics[0]).toMatchObject({ code: 'CALCULATION_ERROR', severity: 'error' });
    const ctx = { timeTo: 2000, diagnostics: [] as Diagnostic[] };
    evaluateThresholdCondition('$MISSING >', new Map(), ctx);
    expect(ctx.diagnostics[0]).toMatchObject({ code: 'INVALID_CONDITION', severity: 'error' });
  }
);

it('[N22] неправильный тип условия не удаляет доступную метрику и её базовый цвет', async () => {
  const diagnostics: Diagnostic[] = [];
  const result = getMetricsData(
    [
      {
        queries: [{ refid: 'A' }],
        baseColor: 'green',
        thresholds: [{ value: 5, color: 'red', condition: 42 as unknown as string }],
      },
    ],
    await input([10]),
    undefined,
    { timeTo: 2000, diagnostics }
  );
  expect(result.fields?.[0]).toMatchObject({ metricValue: 10, color: 'green' });
  expect(diagnostics.map((d) => d.code)).toEqual(['INVALID_CONDITION']);
});
