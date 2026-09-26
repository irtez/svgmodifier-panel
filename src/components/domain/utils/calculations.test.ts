import { dateTime } from '@grafana/data';
import { DataFrameMap, Diagnostic } from '../models';
import {
  calculateExpressions,
  calculateValue,
  evaluateThresholdCondition,
  getMath,
  getMetricColor,
} from './calculations';

const frame = (values: string[]): DataFrameMap => new Map([['A', { values: new Map([['value', { values }]]) }]]);
const context = (time = '2026-01-05T22:30:00Z') => ({
  timeTo: Date.parse(time),
  diagnostics: [] as Diagnostic[],
});

describe('числа, пороги и условия', () => {
  it('[L03] сохраняет явный нулевой уровень и цвет порога', () => {
    expect(getMetricColor(20, new Map(), [{ value: 10, color: 'blue', lvl: 0 }], 'green')).toEqual({
      color: 'blue',
      lvl: 0,
    });
  });

  it.each([
    [5, 'red', 3],
    [10, 'green', 1],
    [30, 'green', 1],
    [31, 'red', 3],
    [100, 'green', 1],
    [120, 'green', 1],
    [121, 'red', 3],
  ])('[L01,L02] сохраняет нормальные диапазоны для значения %s', (value, color, lvl) => {
    // Максимум lvl среди совпавших порогов ошибочно сделал бы нормальные диапазоны красными.
    const thresholds = [
      { value: 0, color: 'red', lvl: 3 },
      { value: 10, color: 'green', lvl: 1 },
      { value: 30, operator: '>' as const, color: 'red', lvl: 3 },
      { value: 100, color: 'green', lvl: 1 },
      { value: 120, operator: '>' as const, color: 'red', lvl: 3 },
    ];
    expect(getMetricColor(Number(value), new Map(), thresholds, 'green')).toEqual({ color, lvl });
  });

  it('[L04,D01] базовый ноль и автоматические уровни сохраняются', () => {
    expect(calculateValue([0], 'last')).toBe(0);
    expect(getMetricColor(0, new Map(), [{ value: 10, color: 'red' }], 'green')).toEqual({ color: 'green', lvl: 0 });
    expect(getMetricColor(20, new Map(), [{ value: 10, color: 'red' }], 'green')).toEqual({ color: 'red', lvl: 1 });
  });

  it('[D02] пустой ряд не превращается в числовой ноль', () => {
    expect(() => calculateValue([], 'last')).toThrow();
  });

  it.each([NaN, Infinity, -Infinity])('[D05,D06] last не принимает нечисловую последнюю точку %s', (value) => {
    expect(() => calculateValue([10, value], 'last')).toThrow();
  });

  it('[E01] формула использует исходную точность', async () => {
    const timeRange = { from: dateTime(0), to: dateTime(1000), raw: { from: 'now-1h', to: 'now' } };
    const result = await calculateExpressions([{ refId: 'B', expression: '$A * 1000' }], frame(['0.004']), timeRange);
    expect(result.get('B')?.values.get('B')?.values).toEqual(['4']);
  });

  it('[D04,E02] отсутствующая зависимость не подставляется нулём', () => {
    expect(() => getMath('$B + 1', frame(['2']))).toThrow();
  });

  it('[T01,T02] час и день относятся к правой границе в одном смещении', () => {
    const ctx = context(); // Понедельник UTC, вторник в UTC+3.
    expect(evaluateThresholdCondition('hour === 1 && minute === 30 && day === 2', new Map(), ctx)).toBe(true);
    expect(evaluateThresholdCondition('timezone = 0, hour === 22 && day === 1', new Map(), ctx)).toBe(true);
    expect(ctx.diagnostics).toEqual([]);
  });

  it('[E03] функция вместо boolean является ошибкой условия', () => {
    const ctx = context();
    expect(evaluateThresholdCondition('hour => 22', new Map(), ctx)).toBe(false);
    expect(ctx.diagnostics).toEqual([expect.objectContaining({ code: 'INVALID_CONDITION' })]);
  });

  it('[D12,E04] необычное, но корректное false не является ошибкой', () => {
    const ctx = context();
    expect(evaluateThresholdCondition('hour >= 99', new Map(), ctx)).toBe(false);
    expect(ctx.diagnostics).toEqual([]);
  });

  it('[D11] ошибка условия не уничтожает число и другие исправные пороги', () => {
    const ctx = context();
    const result = getMetricColor(
      20,
      new Map(),
      [
        { value: 10, color: 'orange' },
        { value: 15, color: 'red', condition: 'minute 30' },
      ],
      'green',
      ctx
    );
    expect(result).toEqual({ color: 'orange', lvl: 1 });
    expect(ctx.diagnostics).toHaveLength(1);
  });

  it.each(['1', '"yes"', 'null', '({})'])(
    '[E03] небулев результат %s не считается выполненным условием',
    (condition) => {
      const ctx = context();
      expect(evaluateThresholdCondition(condition, new Map(), ctx)).toBe(false);
      expect(ctx.diagnostics[0].code).toBe('INVALID_CONDITION');
    }
  );

  it('[T03,T04] live и сдвинутая правая граница используются ровно один раз', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-05T10:15:00Z'));
    try {
      expect(
        evaluateThresholdCondition('hour === 13 && minute === 15', new Map(), context(new Date().toISOString()))
      ).toBe(true);
      expect(
        evaluateThresholdCondition('hour === 10 && minute === 15', new Map(), context('2026-01-05T07:15:00Z'))
      ).toBe(true);
      expect(
        evaluateThresholdCondition(
          'timezone = -5, hour === 20 && day === 0',
          new Map(),
          context('2026-01-05T01:00:00Z')
        )
      ).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it.each(['$missing + 1', '1 / 0', 'not valid syntax', '"5"'])(
    '[E02,D06] не публикует неудачную формулу %s',
    async (expression) => {
      const diagnostics: Diagnostic[] = [];
      const result = await calculateExpressions(
        [{ refId: 'B', expression }],
        frame(['2']),
        { from: dateTime(0), to: dateTime(1000), raw: { from: dateTime(0), to: dateTime(1000) } },
        diagnostics
      );
      expect(result.has('B')).toBe(false);
      expect(diagnostics).toEqual([
        expect.objectContaining({ source: expect.objectContaining({ expressionRefId: 'B' }) }),
      ]);
      expect(result.get('A')).toBeDefined();
    }
  );
});
