import { ConfigRules, DataFrameMap } from 'components/domain/models';
import type { PreparedPanelConfig } from 'components/infrastructure/config/configSetup';
import { buildPanelPresentation } from 'components/application/adapters/panelPresentation';
import { evaluatePanel } from './evaluator';

class SyntheticSVGTextElement extends SVGElement {}

beforeAll(() => {
  Object.defineProperty(globalThis, 'SVGTextElement', {
    configurable: true,
    value: SyntheticSVGTextElement,
  });
});

function fieldFrame(entries: Record<string, number>, dataSourceName?: string): DataFrameMap {
  return new Map([
    [
      'A',
      {
        dataSourceName,
        values: new Map(Object.entries(entries).map(([name, value]) => [name, { values: [String(value)] }])),
      },
    ],
  ]);
}

function svgTarget(id: string): { root: SVGElement; shape: SVGElement; text: SVGElement } {
  const host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const root = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const shape = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');

  root.id = id;
  shape.setAttribute('fill', '#111111');
  shape.setAttribute('stroke', '#222222');
  text.textContent = 'unchanged';
  Object.setPrototypeOf(text, SyntheticSVGTextElement.prototype);
  root.append(shape, text);
  host.append(root);

  return { root, shape, text };
}

function preparedConfig(root: SVGElement, attributes: Array<ConfigRules['attributes']>): PreparedPanelConfig {
  return {
    elementsById: new Map([[root.id, root]]),
    rulesByElementId: new Map([
      [
        root.id,
        attributes.map((item) => ({
          selector: undefined,
          elemIndex: 0,
          elemsLength: 1,
          attributes: item,
        })),
      ],
    ]),
  };
}

function runPipeline(config: PreparedPanelConfig, data: DataFrameMap, mode: 'svg' | 'grid', notify: boolean) {
  const evaluation = evaluatePanel(config.rulesByElementId, data);
  return buildPanelPresentation(evaluation, config.elementsById, {
    mode,
    notifySettings: { show: notify, threshold: undefined },
  });
}

describe('evaluation and presentation behavior', () => {
  it('uses the first equal field winner for SVG, tooltip, and notify output', () => {
    const { root, shape, text } = svgTarget('cell-a');
    const data = fieldFrame({ 'metric-a': 5, 'metric-b': 5 });
    const config = preparedConfig(root, [
      {
        label: 'colon',
        labelColor: 'metric',
        link: 'https://example.test/details',
        tooltip: { show: true, textAbove: 'Synthetic status' },
        metrics: [
          {
            filling: 'fs, 40',
            queries: [
              {
                refid: 'A',
                legend: undefined as never,
                filter: { include: { '': ['metric-a'] }, exclude: {} },
                baseColor: '#00aa00',
                thresholds: [{ value: 5, operator: '>=', color: '#ff0000', lvl: 2 }],
                dataSourceName: 'synthetic-source',
                title: 'First metric',
              },
              {
                refid: 'A',
                legend: undefined as never,
                filter: { include: { '': ['metric-b'] }, exclude: {} },
                baseColor: '#00aa00',
                thresholds: [{ value: 5, operator: '>=', color: '#0000ff', lvl: 2 }],
                dataSourceName: 'synthetic-source',
                title: 'Second metric',
              },
            ],
          },
        ],
      },
    ]);

    const result = runPipeline(config, data, 'svg', true);

    expect(result.operations).toHaveLength(1);
    result.operations?.[0]();

    expect(shape.getAttribute('fill')).toBe('#ff0000');
    expect(shape.getAttribute('stroke')).toBe('#ff0000');
    expect(shape.getAttribute('fill-opacity')).toBe('0.4');
    expect(text.getAttribute('fill')).toBe('#ff0000');
    expect(text.textContent).toBe('metric-a: 5');
    expect(root.parentElement?.tagName.toLowerCase()).toBe('a');
    expect(root.parentElement?.getAttribute('href')).toBe('https://example.test/details');

    expect(result.tooltipContent).toEqual([
      {
        id: 'cell-a',
        queryData: [
          { label: 'metric-a', metric: '5', color: '#ff0000', title: 'First metric' },
          { label: 'metric-b', metric: '5', color: '#0000ff', title: 'Second metric' },
        ],
        textAbove: 'Synthetic status',
        textBelow: undefined,
      },
    ]);
    expect(result.dataSourceMap).toEqual(new Map([['synthetic-source', new Set(['A'])]]));
  });

  it('keeps the current table winner fields and tooltip rows', () => {
    const { root, shape } = svgTarget('cell-b');
    const data: DataFrameMap = new Map([
      [
        'B',
        {
          type: 'table',
          length: 2,
          values: new Map([
            ['name', { values: ['row-a', 'row-b'] }],
            ['status', { values: ['2', '5'] }],
          ]),
        },
      ],
    ]);
    const config = preparedConfig(root, [
      {
        tooltip: { show: true },
        metrics: [
          {
            thresholdKey: 'status',
            baseColor: '#00aa00',
            thresholds: [{ value: 4, operator: '>=', color: '#ff0000', lvl: 3 }],
            queries: [{ refid: 'B', legend: undefined as never, title: 'Synthetic table' }],
          },
        ],
      },
    ]);

    const result = runPipeline(config, data, 'svg', false);

    result.operations?.[0]();
    expect(shape.getAttribute('fill')).toBe('#ff0000');
    expect(result.tooltipContent).toEqual([
      {
        id: 'cell-b',
        queryTableData: [
          {
            headers: ['name', 'status'],
            columnsData: [
              { row: ['row-a', '2'], color: '#00aa00', lvl: 0 },
              { row: ['row-b', '5'], color: '#ff0000', lvl: 3 },
            ],
            title: 'Synthetic table',
          },
        ],
        textAbove: undefined,
        textBelow: undefined,
      },
    ]);
  });

  it('[U10] uses the final winning rule color in grid', () => {
    const { root } = svgTarget('cell-c');
    const data: DataFrameMap = new Map([
      ['A', { values: new Map([['first', { values: ['1'] }]]) }],
      ['B', { values: new Map([['second', { values: ['9'] }]]) }],
    ]);
    const config = preparedConfig(root, [
      {
        title: 'Synthetic cell',
        metrics: [
          {
            baseColor: '#00aa00',
            queries: [{ refid: 'A', legend: undefined as never }],
          },
        ],
      },
      {
        metrics: [
          {
            baseColor: '#00aa00',
            thresholds: [{ value: 5, operator: '>=', color: '#ff0000', lvl: 2 }],
            queries: [{ refid: 'B', legend: undefined as never }],
          },
        ],
      },
    ]);

    const result = runPipeline(config, data, 'grid', false);

    expect(result.gridContent).toEqual([
      {
        id: 'cell-c',
        title: 'Synthetic cell',
        color: '#ff0000',
        fields: [
          {
            counter: 1,
            label: 'first',
            color: '#00aa00',
            lvl: 0,
            metricValue: 1,
            displayValue: '1',
            filling: 'fill',
            title: '',
            dsName: undefined,
            refId: 'A',
          },
          {
            counter: 1,
            label: 'second',
            color: '#ff0000',
            lvl: 2,
            metricValue: 9,
            displayValue: '9',
            filling: 'fill',
            title: '',
            dsName: undefined,
            refId: 'B',
          },
        ],
        tables: [],
      },
    ]);
  });
});
