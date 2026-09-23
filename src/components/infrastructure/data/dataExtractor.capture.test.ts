import { DataFrame, dateTime, FieldType, LoadingState, PanelData, TimeRange } from '@grafana/data';

import { FieldSources } from 'components/capture/fieldSources';

import { extractFields } from './dataExtractor';

const range: TimeRange = { from: dateTime(0), to: dateTime(10_000), raw: { from: 'now-10s', to: 'now' } };

function panelData(series: DataFrame[]): PanelData {
  return { state: LoadingState.Done, timeRange: range, series };
}

describe('capture field sources', () => {
  it('сохраняет исходные имена, типы, labels и сырые значения таблицы', async () => {
    const rawValues = [true, null, 7];
    const frame: DataFrame = {
      refId: 'A',
      name: 'Synthetic frame',
      length: 3,
      meta: {
        preferredVisualisationType: 'table',
        custom: {
          datasource: { uid: 'source-uid', type: 'synthetic-type', name: 'Synthetic source' },
        },
      },
      fields: [
        {
          name: 'status',
          type: FieldType.boolean,
          values: rawValues,
          config: { displayName: 'Boolean legend' },
          labels: { region: 'test' },
        },
      ],
    };
    const capture = new FieldSources();
    const input = panelData([frame]);
    input.request = {
      app: 'dashboard',
      requestId: 'capture-test',
      interval: '1s',
      intervalMs: 1_000,
      range,
      scopedVars: {},
      startTime: 0,
      timezone: 'utc',
      targets: [{ refId: 'A', datasource: { uid: 'request-uid', type: 'request-type' } }],
    };

    const result = await extractFields(input, undefined, range, capture);
    const extracted = result.get('A')!.values.get('Boolean legend')!;

    expect(extracted.values).toEqual(['true', null, '7']);
    expect(capture.getOrigin(extracted)).toEqual({
      fieldName: 'status',
      fieldType: FieldType.boolean,
      frameName: 'Synthetic frame',
      frameIndex: 0,
      fieldIndex: 0,
      legend: 'Boolean legend',
      labels: { region: 'test' },
      dataSource: { uid: 'source-uid', type: 'synthetic-type', name: 'Synthetic source' },
      rawValues,
    });
    expect(capture.getOrigin(extracted)!.rawValues).toBe(rawValues);
  });

  it('учитывает исходный индекс, одинаковые легенды и custom range без graph raw history', async () => {
    const firstRaw = [1, 2, 3];
    const secondRaw = [4, 5, 6];
    const graphRange: TimeRange = {
      from: dateTime(0),
      to: dateTime(600_000),
      raw: { from: 'now-10m', to: 'now' },
    };
    const frame: DataFrame = {
      refId: 'A',
      length: 3,
      meta: { preferredVisualisationType: 'graph' },
      fields: [
        { name: 'time', type: FieldType.time, values: [0, 300_000, 600_000], config: {} },
        { name: 'first', type: FieldType.number, values: firstRaw, config: { displayName: 'same' } },
        { name: 'second', type: FieldType.number, values: secondRaw, config: { displayName: 'same' } },
      ],
    };
    const capture = new FieldSources();
    const skippedFrame: DataFrame = { length: 0, fields: [] };

    const result = await extractFields(panelData([skippedFrame, frame]), { global: '5m' }, graphRange, capture);
    const first = result.get('A')!.values.get('same')!;
    const second = result.get('A')!.values.get('same_1')!;

    expect(first).toEqual({ values: ['2', '3'], timestamps: [300_000, 600_000] });
    expect(capture.getOrigin(first)).toMatchObject({
      fieldName: 'first',
      frameIndex: 1,
      fieldIndex: 1,
      legend: 'same',
    });
    expect(capture.getOrigin(second)).toMatchObject({
      fieldName: 'second',
      frameIndex: 1,
      fieldIndex: 2,
      legend: 'same',
    });
    expect(capture.getOrigin(first)).not.toHaveProperty('rawValues');
    expect(capture.getOrigin(second)).not.toHaveProperty('rawValues');
  });

  it('не читает metadata без capture и не меняет результат извлечения', async () => {
    const frame: DataFrame = {
      refId: 'A',
      length: 2,
      fields: [{ name: 'value', type: FieldType.number, values: [1, 2], config: {} }],
    };
    Object.defineProperty(frame, 'name', {
      get: () => {
        throw new Error('capture metadata must stay lazy');
      },
    });

    const captureOffData = panelData([frame]);
    Object.defineProperty(captureOffData, 'request', {
      get: () => {
        throw new Error('request targets must stay lazy');
      },
    });

    const withoutCapture = await extractFields(captureOffData, undefined, range);
    expect(withoutCapture).toEqual(
      new Map([['A', { values: new Map([['value', { values: ['1', '2'] }]]), type: 'table', length: 2 }]])
    );

    const ordinaryFrame: DataFrame = {
      refId: 'A',
      length: 2,
      fields: [{ name: 'value', type: FieldType.number, values: [1, 2], config: {} }],
    };
    const capture = new FieldSources();
    const withCapture = await extractFields(panelData([ordinaryFrame]), undefined, range, capture);
    const baseline = await extractFields(panelData([ordinaryFrame]), undefined, range);
    expect(withCapture).toEqual(baseline);
  });

  it('берёт uid и type только из единственного прямого target того же refId', async () => {
    const frame: DataFrame = {
      refId: 'A',
      length: 1,
      fields: [{ name: 'value', type: FieldType.number, values: [1], config: {} }],
    };
    const input = panelData([frame]);
    input.request = {
      app: 'dashboard',
      requestId: 'capture-test',
      interval: '1s',
      intervalMs: 1_000,
      range,
      scopedVars: {},
      startTime: 0,
      timezone: 'utc',
      targets: [
        { refId: 'B', datasource: { uid: 'other-uid', type: 'other-type' } },
        { refId: 'A', datasource: { uid: 'source-uid', type: 'source-type' } },
      ],
    };
    const capture = new FieldSources();

    const result = await extractFields(input, undefined, range, capture);
    const extracted = result.get('A')!.values.get('value')!;

    expect(capture.getOrigin(extracted)!.dataSource).toEqual({
      uid: 'source-uid',
      type: 'source-type',
      name: null,
    });
  });

  it.each([
    {
      label: 'proxy target другой панели',
      targets: [{ refId: 'A', panelId: 42, datasource: { uid: 'proxy-uid', type: 'dashboard' } }],
    },
    {
      label: 'несколько подходящих targets',
      targets: [
        { refId: 'A', datasource: { uid: 'first-uid', type: 'first-type' } },
        { refId: 'A', datasource: { uid: 'second-uid', type: 'second-type' } },
      ],
    },
    {
      label: 'target без datasource metadata',
      targets: [{ refId: 'A', datasource: null }],
    },
  ])('оставляет datasource пустым: $label', async ({ targets }) => {
    const frame: DataFrame = {
      refId: 'A',
      length: 1,
      fields: [{ name: 'value', type: FieldType.number, values: [1], config: {} }],
    };
    const input = panelData([frame]);
    input.request = {
      app: 'dashboard',
      requestId: 'capture-test',
      interval: '1s',
      intervalMs: 1_000,
      range,
      scopedVars: {},
      startTime: 0,
      timezone: 'utc',
      targets,
    };
    const capture = new FieldSources();

    const result = await extractFields(input, undefined, range, capture);
    const extracted = result.get('A')!.values.get('value')!;

    expect(capture.getOrigin(extracted)!.dataSource).toEqual({ uid: null, type: null, name: null });
  });
});
