import { renderHook } from '@testing-library/react';
import { dateTime } from '@grafana/data';
import { DataFrameMap } from 'components/domain/models';
import { evaluatePanel } from 'components/domain/services/evaluator';
import { initializeConfig } from 'components/infrastructure/config/configSetup';
import { parseYamlConfig } from 'components/infrastructure/config/parsers';
import { useGridPanel } from 'components/presentation/components/grid/hooks/useGridPanel';
import { buildPanelPresentation } from './panelPresentation';

it('[L08,L09] grid и notify сохраняют отбор по lvl, независимо от цвета', () => {
  const prepared = initializeConfig(
    null,
    parseYamlConfig(`changes:
  - id: zero
    attributes:
      metrics:
        queries: [{refid: A}]
        thresholds: [{value: 0, lvl: 0, color: blue}]
  - id: green
    attributes:
      metrics:
        queries: [{refid: B}]
        thresholds: [{value: 0, lvl: 2, color: green}]
  - id: table
    attributes:
      metrics:
        queries: [{refid: T}]
        thresholdKey: value
        thresholds: [{value: 0, lvl: 3, color: red}]
`)
  );
  const data: DataFrameMap = new Map([
    ['A', { dataSourceName: 'Synthetic', values: new Map([['value', { values: ['95'] }]]) }],
    ['B', { dataSourceName: 'Synthetic', values: new Map([['value', { values: ['1'] }]]) }],
    ['T', { dataSourceName: 'Synthetic', type: 'table', length: 1, values: new Map([['value', { values: ['95'] }]]) }],
  ]);
  const evaluation = evaluatePanel(prepared.rulesByElementId, data);
  const grid = buildPanelPresentation(evaluation, new Map(), {
    mode: 'grid',
    notifySettings: { show: true, threshold: undefined },
  });
  expect(evaluation.elements[0].winner).toMatchObject({ lvl: 0, color: 'blue' });
  expect(grid.dataSourceMap?.get('Synthetic')).toEqual(new Set(['B'])); // Таблицы по-прежнему не входят в notify.
  const timeRange = { from: dateTime(0), to: dateTime(1), raw: { from: 'now-3h', to: 'now' } };
  const processed = {
    inputKey: {},
    ...grid,
    evaluation,
    timeRange,
    generation: 1,
    queriesData: data,
    tooltipContent: [],
    dataSourceMap: grid.dataSourceMap!,
  };
  const hook = renderHook(() => useGridPanel(processed, true, true));
  expect(hook.result.current.map((item) => item.id)).toEqual(['cell-green', 'cell-table']);
  const notifyWithThreshold = buildPanelPresentation(evaluation, new Map(), {
    mode: 'svg',
    notifySettings: { show: true, threshold: 80 },
  });
  expect(notifyWithThreshold.dataSourceMap?.get('Synthetic')).toEqual(new Set(['A', 'B']));
});
