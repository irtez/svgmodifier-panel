import { DataFrameMap, Diagnostic, Metrics } from '../models';
import { getMetricsData } from './dataHandler';
import { selectBestQuery } from './queryProcessor';
import { queriesFilter } from './queryFilter';

const tableData = (rows: string[][], headers = ['name', 'status', 'extra']): DataFrameMap =>
  new Map([
    [
      'A',
      {
        type: 'table',
        length: rows.length,
        values: new Map(headers.map((name, i) => [name, { values: rows.map((row) => row[i]) }])),
      },
    ],
  ]);
const config = (thresholdKey = 'status'): Metrics[] => [
  {
    baseColor: 'green',
    thresholdKey,
    thresholds: [
      { value: 50, color: 'orange', lvl: 1 },
      { value: 80, color: 'red', lvl: 2 },
    ],
    queries: [{ refid: 'A' }],
  },
];
const context = () => ({ timeTo: 0, diagnostics: [] as Diagnostic[] });

describe('табличные результаты и выбор метрики', () => {
  it('[B01,B09] цвет, уровень и raw value относятся к одной критической строке', () => {
    const result = getMetricsData(
      config(),
      tableData([
        ['first', '95', 'x'],
        ['last', '0', 'x'],
      ])
    ).tables![0];
    expect(result).toMatchObject({ color: 'red', lvl: 2, metricValue: 95 });
    expect(result.columnsData).toHaveLength(2);
  });

  it('[B02] при равных уровнях выбирает первую строку', () => {
    const result = getMetricsData(
      config(),
      tableData([
        ['first', '85', 'x'],
        ['last', '99', 'x'],
      ])
    ).tables![0];
    expect(result.metricValue).toBe(85);
  });

  it('[B05] точное имя колонки приоритетнее предыдущего префикса', () => {
    const result = getMetricsData(config('errors'), tableData([['a', '0', '95']], ['name', 'errors_old', 'errors']))
      .tables![0];
    expect(result).toMatchObject({ label: 'errors', metricValue: 95, color: 'red' });
  });

  it('[B06] сохраняет однозначный префикс', () => {
    const result = getMetricsData(config('stat'), tableData([['a', '95', 'x']])).tables![0];
    expect(result.metricValue).toBe(95);
  });

  it('[B07] неоднозначный префикс не выбирает произвольную колонку', () => {
    const ctx = context();
    const result = getMetricsData(
      config('errors'),
      tableData([['a', '0', '95']], ['name', 'errors_old', 'errors_new']),
      undefined,
      ctx
    );
    expect(result.tables).toHaveLength(0);
    expect(ctx.diagnostics).toEqual([expect.objectContaining({ code: 'AMBIGUOUS_FIELD' })]);
  });

  it('[D03,B08] сохраняет причину отсутствующего запроса и пустой таблицы', () => {
    const ctx = context();
    getMetricsData(config(), new Map(), undefined, ctx);
    expect(ctx.diagnostics).toEqual([
      expect.objectContaining({ code: 'MISSING_INPUT', source: expect.objectContaining({ refId: 'A' }) }),
    ]);
    const empty = context();
    getMetricsData(config(), tableData([]), undefined, empty);
    expect(empty.diagnostics).toEqual([expect.objectContaining({ code: 'EMPTY_INPUT' })]);
  });

  it('[L05,L06] равные уровни не сравнивают значения и типы candidates', () => {
    const first = { counter: 1, label: 'a', metricValue: 0, lvl: 1, color: 'orange' };
    const second = { counter: 2, label: 'b', metricValue: 100, lvl: 1, color: 'red', columnsData: [], headers: [] };
    expect(selectBestQuery({ fields: [first], tables: [second] }).winner).toBe(first);
    expect(
      selectBestQuery({ fields: [{ ...first, counter: 2 }], tables: [{ ...second, counter: 1 }] }).winner?.label
    ).toBe('b');
    expect(
      selectBestQuery({ fields: [first, { ...first, counter: 2, metricValue: 100, label: 'larger' }] }).winner
    ).toBe(first);
  });

  it('[D13] пустой первый запрос не сдвигает второй на первый элемент autoConfig', () => {
    const metrics: Metrics[] = [{ queries: [{ refid: 'missing' }, { refid: 'B' }], baseColor: 'green' }];
    const data: DataFrameMap = new Map([['B', { values: new Map([['b', { values: ['7'] }]]) }]]);
    const all = getMetricsData(metrics, data);
    expect(queriesFilter(all, undefined, 0, 2, true).fields).toHaveLength(0);
    expect(queriesFilter(all, undefined, 1, 2, true).fields?.[0]).toMatchObject({ metricValue: 7 });
  });

  it('[D07,D08] ошибка одной серии не скрывает исправную красную серию того же запроса', () => {
    const data: DataFrameMap = new Map([
      [
        'A',
        {
          values: new Map([
            ['good', { values: ['95'] }],
            ['missing', { values: [] }],
          ]),
        },
      ],
    ]);
    const ctx = context();
    const result = getMetricsData(config(), data, undefined, ctx);
    expect(result.fields).toEqual([expect.objectContaining({ label: 'good', color: 'red', metricValue: 95 })]);
    expect(ctx.diagnostics).toHaveLength(1);
  });

  it('[B10] таблица для чтения без thresholdKey не получает выдуманный ноль', () => {
    const result = getMetricsData([{ queries: [{ refid: 'A' }] }], tableData([['a', '95', 'x']]));
    expect(result.tables?.[0].columnsData).toHaveLength(1);
    expect(result.tables?.[0].metricValue).toBeUndefined();
    expect(selectBestQuery(result).winner).toBeUndefined();
  });

  it('[D15] рассчитанная метрика сохраняет имя datasource без мутации конфига', () => {
    const metrics: Metrics[] = [{ queries: [{ refid: 'A' }] }];
    const data: DataFrameMap = new Map([
      ['A', { dataSourceName: 'synthetic-source', values: new Map([['value', { values: ['5'] }]]) }],
    ]);
    expect(getMetricsData(metrics, data).fields?.[0].dsName).toBe('synthetic-source');
    expect(metrics[0].queries?.[0].dataSourceName).toBeUndefined();
  });

  it('[B08] пропавшая колонка и отфильтрованные строки не создают winner', () => {
    const ctx = context();
    expect(getMetricsData(config('absent'), tableData([['a', '1', 'x']]), undefined, ctx).tables).toHaveLength(0);
    expect(ctx.diagnostics[0].code).toBe('MISSING_FIELD');
    const filtered = config();
    filtered[0].queries![0].filter = { include: { name: ['nobody'] }, exclude: {} };
    const empty = context();
    expect(getMetricsData(filtered, tableData([['a', '95', 'x']]), undefined, empty).tables).toHaveLength(0);
    expect(empty.diagnostics[0].code).toBe('EMPTY_INPUT');
  });

  it('[B09] value mapping меняет текст, но не число и не победителя', () => {
    const result = getMetricsData(
      config(),
      tableData([
        ['first', '95', 'x'],
        ['last', '0', 'x'],
      ]),
      [{ condition: '>=', value: 80, label: 'Critical' }]
    ).tables![0];
    expect(result).toMatchObject({
      metricValue: 95,
      displayValue: 'Critical',
      color: 'red',
      lvl: 2,
      winningRowIndex: 0,
    });
    expect(result.columnsData[0].row[1]).toBe('Critical');
  });

  it.each(['', 'null', 'undefined', 'NaN', 'Infinity'])(
    '[D05,D06] пустое/нечисловое поле %s не становится нулём',
    (value) => {
      const ctx = context();
      const result = getMetricsData(
        config(),
        new Map([['A', { values: new Map([['a', { values: [value] }]]) }]]),
        undefined,
        ctx
      );
      expect(result.fields).toHaveLength(0);
      expect(ctx.diagnostics[0].code).toBe('NON_FINITE_VALUE');
    }
  );

  it('[D14] неполная сумма не выдаётся за полную', () => {
    const ctx = context();
    const result = getMetricsData(
      [{ queries: [{ refid: 'A', sum: 'Total' }] }],
      new Map([
        [
          'A',
          {
            values: new Map([
              ['one', { values: ['5'] }],
              ['two', { values: [] }],
            ]),
          },
        ],
      ]),
      undefined,
      ctx
    );
    expect(result.fields).toHaveLength(0);
    expect(ctx.diagnostics[0].code).toBe('EMPTY_INPUT');
  });

  it('[C27] autoConfig сохраняет прежнее распределение исправных fields и tables', () => {
    const data = tableData([['row', '95', 'x']]);
    data.set('B', { values: new Map([['field', { values: ['7'] }]]) });
    const all = getMetricsData([{ queries: [{ refid: 'B' }, { refid: 'A' }], thresholdKey: 'status' }], data);
    // Legacy autoConfig индексирует fields и tables отдельно: смешанные данные
    // первого индекса остаются на первом элементе. Не меняем существующую раскладку.
    const first = queriesFilter(all, [], 0, 2, true);
    const second = queriesFilter(all, [], 1, 2, true);
    expect(first.fields).toHaveLength(1);
    expect(first.tables).toHaveLength(1);
    expect(second.fields).toHaveLength(0);
    expect(second.tables).toHaveLength(0);
    data.get('B')!.values.get('field')!.values = [];
    const incomplete = getMetricsData([{ queries: [{ refid: 'B' }, { refid: 'A' }], thresholdKey: 'status' }], data);
    expect(queriesFilter(incomplete, [], 0, 2, true).tables).toHaveLength(1);
    expect(queriesFilter(incomplete, [], 1, 2, true).tables).toHaveLength(0);
  });

  it('[C28] фиксирует ограничение autoConfig при исчезновении целого многорядного запроса', () => {
    const metrics: Metrics[] = [{ queries: [{ refid: 'A' }, { refid: 'B' }] }];
    const data: DataFrameMap = new Map([
      [
        'A',
        {
          values: new Map([
            ['a1', { values: ['1'] }],
            ['a2', { values: ['2'] }],
          ]),
        },
      ],
      ['B', { values: new Map([['b', { values: ['3'] }]]) }],
    ]);
    const assignments = () => {
      const all = getMetricsData(metrics, data);
      return [0, 1, 2].map((index) => queriesFilter(all, [], index, 3, true).fields?.map((field) => field.label));
    };
    expect(assignments()).toEqual([['a1'], ['a2'], ['b']]);
    data.delete('A');
    // Без памяти прежних series неизвестно, сколько мест занимал исчезнувший A.
    // Это ограничение, не гарантия стабильной привязки при изменении состава рядов.
    expect(assignments()).toEqual([[], ['b'], []]);
  });
});
