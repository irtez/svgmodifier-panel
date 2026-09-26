import { dateTime, FieldType, LoadingState, PanelData, TimeRange } from '@grafana/data';
import { extractFields } from './dataExtractor';

const range: TimeRange = { from: dateTime(0), to: dateTime(1000), raw: { from: 'now-1h', to: 'now' } };
const data = (
  fields: Array<{ name: string; type: FieldType; values: any[] }>,
  visualType?: 'table' | 'graph'
): PanelData => ({
  state: LoadingState.Done,
  timeRange: range,
  series: [
    {
      refId: 'A',
      length: 2,
      fields: fields.map((f) => ({ ...f, config: {} })),
      meta: { preferredVisualisationType: visualType },
    },
  ],
});

it('[B03] две колонки без времени остаются таблицей', async () => {
  const result = await extractFields(
    data(
      [
        { name: 'service', type: FieldType.string, values: ['a', 'b'] },
        { name: 'errors', type: FieldType.number, values: [95, 0] },
      ],
      'table'
    ),
    undefined,
    range
  );
  expect(result.get('A')?.type).toBe('table');
  expect([...result.get('A')!.values.keys()]).toEqual(['service', 'errors']);
});

it('[B04] временной ряд сохраняет оба числовых поля', async () => {
  const result = await extractFields(
    data(
      [
        { name: 'time', type: FieldType.time, values: [0, 1000] },
        { name: 'first', type: FieldType.number, values: [1, 2] },
        { name: 'second', type: FieldType.number, values: [3, 4] },
      ],
      'graph'
    ),
    undefined,
    range
  );
  expect(result.get('A')?.type).toBe('graph');
  expect([...result.get('A')!.values.keys()]).toEqual(['first', 'second']);
  expect(result.get('A')!.values.get('second')?.values).toEqual(['3', '4']);
});
