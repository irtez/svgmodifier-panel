import { dateTime, FieldType, LoadingState, PanelData, TimeRange } from '@grafana/data';
import type { PanelOptions } from 'types';

export const range = (to = 100000): TimeRange => ({
  from: dateTime(to - 1000),
  to: dateTime(to),
  raw: { from: 'now-3h', to: 'now' },
});
export const options = (): PanelOptions => ({
  displayMode: 'svg',
  grid: { columnMode: 'auto' },
  table: { rows: 1, columns: 1 },
  jsonData: {
    svgCode:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><g id="cell-a"><rect width="50" height="30" fill="green"/><text x="5" y="20">Service Alpha</text></g></svg>',
    metricsMapping: [
      {
        page: 'Synthetic',
        code: 'changes:\n  - id: a\n    attributes:\n      label: replace\n      tooltip: {show: true}\n      metrics:\n        queries: [{refid: A}]\n        baseColor: green\n        thresholds: [{value: 80, color: red, lvl: 2}]',
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
export const data = (value = 95, timeRange = range()): PanelData => ({
  state: LoadingState.Done,
  timeRange,
  series: [
    {
      refId: 'A',
      name: 'Synthetic source',
      length: 1,
      meta: { preferredVisualisationType: 'graph' },
      fields: [
        { name: 'time', type: FieldType.time, config: {}, values: [timeRange.to.valueOf()] },
        { name: 'raw_alpha_metric', type: FieldType.number, config: {}, values: [value] },
      ],
    },
  ],
});
