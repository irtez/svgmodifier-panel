import { act, renderHook, waitFor } from '@testing-library/react';
import { dateTime, FieldType, LoadingState, PanelData, TimeRange } from '@grafana/data';
import { PanelOptions } from 'types';
import { DataFrameMap } from 'components/domain/models';
import * as extractor from 'components/infrastructure/data/dataExtractor';
import { usePanelData } from './usePanelData';

jest.mock('components/infrastructure/data/dataExtractor', () => ({
  ...jest.requireActual('components/infrastructure/data/dataExtractor'),
  extractFields: jest.fn(jest.requireActual('components/infrastructure/data/dataExtractor').extractFields),
}));

const range = (to = '2026-01-01T23:59:00Z'): TimeRange => ({
  from: dateTime(Date.parse(to) - 10800000),
  to: dateTime(to),
  raw: { from: 'now-3h', to: 'now' },
});
const options = (filter = ''): PanelOptions => ({
  displayMode: 'svg',
  grid: { columnMode: 'auto' },
  table: { rows: 1, columns: 1 },
  jsonData: {
    svgCode: '<svg xmlns="http://www.w3.org/2000/svg"><g id="cell-a"><rect fill="green"/></g></svg>',
    metricsMapping: [
      {
        page: 'Synthetic',
        code: `changes:\n  - id: a\n    attributes:\n      tooltip: {show: true}\n      metrics:\n        queries: [{refid: A${
          filter ? `, filter: '${filter}'` : ''
        }}]\n        baseColor: green\n        thresholds: [{value: 80, color: red}]`,
      },
    ],
    svgAspectRatio: 'disable',
    customRelativeTime: '',
    fieldsCustomRelativeTime: '',
  },
  transformations: { expressions: [], RelativeTime: '', fieldsRelativeTime: '' },
  tooltip: { sort: 'none', hideZeros: false, maxWidth: 400, maxHeight: 400, valuePosition: 'standard' },
  notifyTooltip: { show: false, offsetX: 0, offsetY: 0, hideInEditMode: true },
  debug: { loggingEnabled: false, logLevel: 'warn', showErrorBanner: false, enableNotifyTooltip: false },
});
const data = (values: Record<string, number>, timeRange = range()): PanelData => ({
  state: LoadingState.Done,
  timeRange,
  series: [
    {
      refId: 'A',
      length: 1,
      meta: { preferredVisualisationType: 'graph' },
      fields: [
        { name: 'time', type: FieldType.time, config: {}, values: [timeRange.to.valueOf()] },
        ...Object.entries(values).map(([name, value]) => ({
          name,
          type: FieldType.number,
          config: {},
          values: [value],
        })),
      ],
    },
  ],
});
afterEach(() => jest.restoreAllMocks());

it('[C29] не монтирует сломанный SVG и возвращает его диагностику', async () => {
  const opts = options();
  opts.jsonData.svgCode = '<svg xmlns="http://www.w3.org/2000/svg"><g></svg>';
  const input = data({ value: 1 });
  const timeRange = range();
  const hook = renderHook(() => usePanelData(input, timeRange, opts));
  await waitFor(() => expect(hook.result.current.processedData?.evaluation.diagnostics?.[0].code).toBe('INVALID_SVG'));
  expect(hook.result.current.svgDoc).toBeNull();
});

it('[G01] запоздалый расчёт не заменяет результат нового обновления', async () => {
  let release!: (data: DataFrameMap) => void;
  const pending = new Promise<DataFrameMap>((resolve) => {
    release = resolve;
  });
  jest.mocked(extractor.extractFields).mockImplementationOnce(() => pending);
  const opts = options();
  const timeRange = range();
  const hook = renderHook(({ input }) => usePanelData(input, timeRange, opts), {
    initialProps: { input: data({ value: 95 }) },
  });
  hook.rerender({ input: data({ value: 7 }) });
  await waitFor(() => expect(hook.result.current.processedData?.tooltipContent[0].queryData?.[0].metric).toBe('7'));
  await act(async () => {
    release(new Map([['A', { values: new Map([['value', { values: ['95'] }]]) }]]));
  });
  expect(hook.result.current.processedData?.tooltipContent[0].queryData?.[0].metric).toBe('7');
});

it('[G02] ошибка datasource не выдаёт старые series за актуальные данные', async () => {
  const opts = options();
  const timeRange = range();
  const input = data({ value: 95 });
  const hook = renderHook(({ input }) => usePanelData(input, timeRange, opts), { initialProps: { input } });
  await waitFor(() => expect(hook.result.current.processedData?.tooltipContent[0].queryData?.[0].metric).toBe('95'));
  hook.rerender({ input: { ...input, state: LoadingState.Loading } });
  await waitFor(() => expect(hook.result.current.isLoading).toBe(true));
  hook.rerender({
    input: { ...input, state: LoadingState.Error, errors: [{ message: 'Synthetic query failure', refId: 'A' }] },
  });
  await waitFor(() => expect(hook.result.current.processedData?.tooltipContent[0].noData).toBe(true));
  expect(hook.result.current.processedData?.evaluation?.elements[0].winner).toBeUndefined();
  expect(hook.result.current.processedData?.evaluation?.diagnostics).toEqual(
    expect.arrayContaining([expect.objectContaining({ code: 'QUERY_ERROR' })])
  );
});

it('[T06,T07,T08] $date обновляется с правой границей без изменения YAML', async () => {
  const opts = options('$date');
  const input = data({ '2026-01-01': 1, '2026-01-02': 2 });
  const hook = renderHook(({ timeRange }) => usePanelData(input, timeRange, opts), {
    initialProps: { timeRange: range() },
  });
  await waitFor(() => expect(hook.result.current.processedData?.tooltipContent[0].queryData?.[0].metric).toBe('1'));
  hook.rerender({ timeRange: range('2026-01-02T00:01:00Z') });
  await waitFor(() => expect(hook.result.current.processedData?.tooltipContent[0].queryData?.[0].metric).toBe('2'));
});

it('[G03] смена конфига и диапазона отменяет предыдущий расчёт', async () => {
  let release!: (data: DataFrameMap) => void;
  jest.mocked(extractor.extractFields).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  const input = data({ value: 7 });
  const hook = renderHook(({ opts, timeRange }) => usePanelData(input, timeRange, opts), {
    initialProps: { opts: options(), timeRange: range() },
  });
  const next = options();
  next.jsonData.metricsMapping[0].code = 'changes: []';
  hook.rerender({ opts: next, timeRange: range('2026-01-02T00:00:00Z') });
  await waitFor(() => expect(hook.result.current.processedData?.evaluation.elements).toEqual([]));
  const generation = hook.result.current.processedData?.generation;
  await act(async () => {
    release(new Map([['A', { values: new Map([['value', { values: ['95'] }]]) }]]));
  });
  expect(hook.result.current.processedData?.generation).toBe(generation);
  expect(hook.result.current.processedData?.evaluation.elements).toEqual([]);
  expect(hook.result.current.processedData?.timeRange.to.valueOf()).toBe(Date.parse('2026-01-02T00:00:00Z'));
});

it('[G02,D08] ошибка отдельного refId сохраняет подтверждённый результат соседнего запроса', async () => {
  const opts = options();
  opts.jsonData.metricsMapping[0].code = opts.jsonData.metricsMapping[0].code.replace(
    'queries: [{refid: A}]',
    'queries: [{refid: A}, {refid: B}]'
  );
  const input = data({ value: 95 });
  const timeRange = range();
  input.series.push({ ...input.series[0], refId: 'B' });
  input.state = LoadingState.Error;
  input.errors = [{ refId: 'A', message: 'Synthetic error' }];
  const hook = renderHook(() => usePanelData(input, timeRange, opts));
  await waitFor(() =>
    expect(hook.result.current.processedData?.evaluation.elements[0].winner).toMatchObject({ refId: 'B', color: 'red' })
  );
  expect(
    hook.result.current.processedData?.tooltipContent[0].diagnostics?.some((item) => item.code === 'QUERY_ERROR')
  ).toBe(true);
});

it('[C10] ошибка одной панели не очищается обновлением другой', async () => {
  const invalid = options();
  invalid.jsonData.metricsMapping = [{ page: 'Broken', code: 'changes: [' }];
  const valid = options();
  const timeRange = range();
  const input = data({ value: 1 });
  const first = renderHook(() => usePanelData(input, timeRange, invalid));
  const second = renderHook(() => usePanelData(input, timeRange, valid));
  await waitFor(() =>
    expect(first.result.current.processedData?.evaluation?.diagnostics?.[0].code).toBe('YAML_PARSE_ERROR')
  );
  await waitFor(() => expect(second.result.current.processedData?.evaluation?.diagnostics).toEqual([]));
  second.rerender();
  expect(first.result.current.processedData?.evaluation?.diagnostics?.[0].code).toBe('YAML_PARSE_ERROR');
});
