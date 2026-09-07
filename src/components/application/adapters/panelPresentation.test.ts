import { ConfigRules, MetricData, PanelEvaluation, TableMetricData } from 'components/domain/models';
import { buildPanelPresentation } from './panelPresentation';

class SyntheticSVGTextElement extends SVGElement {}

beforeAll(() => {
  Object.defineProperty(globalThis, 'SVGTextElement', {
    configurable: true,
    value: SyntheticSVGTextElement,
  });
});

function svgTarget(id: string): { root: SVGElement; shape: SVGElement; text: SVGElement } {
  const host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const root = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const shape = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');

  root.id = id;
  text.textContent = 'unchanged';
  Object.setPrototypeOf(text, SyntheticSVGTextElement.prototype);
  root.append(shape, text);
  host.append(root);

  return { root, shape, text };
}

function field(overrides: Partial<MetricData>): MetricData {
  return {
    counter: 1,
    label: 'metric-a',
    color: '#ff0000',
    lvl: 2,
    metricValue: 5,
    displayValue: '5',
    filling: 'fs, 40',
    title: 'Synthetic field',
    dsName: 'synthetic-source',
    refId: 'A',
    ...overrides,
  };
}

describe('buildPanelPresentation', () => {
  it('projects SVG, tooltip, and notify output from a saved evaluation', () => {
    const { root, shape, text } = svgTarget('cell-a');
    const selectedAttributes: ConfigRules['attributes'] = {
      link: 'https://example.test/details',
      label: 'colon',
      labelColor: 'metric',
      tooltip: { show: true, textAbove: 'Synthetic status' },
    };
    const tableAttributes: ConfigRules['attributes'] = { tooltip: { show: true } };
    const winningField = field({});
    const thresholdField = field({
      counter: 2,
      label: 'metric-b',
      color: '#00aa00',
      lvl: 0,
      refId: 'B',
    });
    const table: TableMetricData = {
      counter: 3,
      headers: ['name', 'status'],
      columnsData: [{ row: ['row-a', '5'], color: '#ffaa00', lvl: 2 }],
      label: 'status',
      metricValue: 5,
      color: '#ffaa00',
      lvl: 2,
      dsName: 'ignored-table-source',
      refId: 'C',
      title: 'Synthetic table',
    };
    const evaluation: PanelEvaluation = {
      elements: [
        {
          id: 'cell-a',
          rules: [
            {
              attributes: selectedAttributes,
              hasMetrics: true,
              fields: [winningField, thresholdField],
              tables: [],
              winner: winningField,
              elementWinnerAfterRule: winningField,
            },
            {
              attributes: tableAttributes,
              hasMetrics: true,
              fields: [],
              tables: [table],
              winner: table,
              elementWinnerAfterRule: winningField,
            },
          ],
          winner: winningField,
          selectedAttributes,
        },
      ],
    };

    const result = buildPanelPresentation(evaluation, new Map([['cell-a', root]]), {
      mode: 'svg',
      notifySettings: { show: true, threshold: 4 },
    });

    expect(result.operations).toHaveLength(1);
    result.operations?.[0]();
    expect(shape.getAttribute('fill')).toBe('#ff0000');
    expect(shape.getAttribute('stroke')).toBe('#ff0000');
    expect(shape.getAttribute('fill-opacity')).toBe('0.4');
    expect(text.getAttribute('fill')).toBe('#ff0000');
    expect(text.textContent).toBe('metric-a: 5');
    expect(root.parentElement?.getAttribute('href')).toBe('https://example.test/details');
    expect(result.tooltipContent).toEqual([
      {
        id: 'cell-a',
        queryData: [
          { label: 'metric-a', metric: '5', color: '#ff0000', title: 'Synthetic field' },
          { label: 'metric-b', metric: '5', color: '#00aa00', title: 'Synthetic field' },
        ],
        queryTableData: [
          {
            headers: ['name', 'status'],
            columnsData: [{ row: ['row-a', '5'], color: '#ffaa00', lvl: 2 }],
            title: 'Synthetic table',
          },
        ],
        textAbove: 'Synthetic status',
        textBelow: undefined,
      },
    ]);
    expect(result.dataSourceMap).toEqual(new Map([['synthetic-source', new Set(['A', 'B'])]]));
    expect(result.gridContent).toBeUndefined();
  });

  it('[U10] uses the final winner color in grid', () => {
    const firstAttributes: ConfigRules['attributes'] = { title: 'Synthetic cell' };
    const first = field({ color: '#00aa00', lvl: 0, metricValue: 1 });
    const second = field({ label: 'metric-b', color: '#ff0000', metricValue: 9 });
    const evaluation: PanelEvaluation = {
      elements: [
        {
          id: 'cell-b',
          rules: [
            {
              attributes: firstAttributes,
              hasMetrics: true,
              fields: [first],
              tables: [],
              winner: first,
              elementWinnerAfterRule: first,
            },
            {
              attributes: {},
              hasMetrics: true,
              fields: [second],
              tables: [],
              winner: second,
              elementWinnerAfterRule: second,
            },
          ],
          winner: second,
          selectedAttributes: {},
        },
      ],
    };

    const result = buildPanelPresentation(evaluation, new Map(), {
      mode: 'grid',
      notifySettings: { show: false, threshold: undefined },
    });

    expect(result.gridContent).toEqual([
      {
        id: 'cell-b',
        title: 'Synthetic cell',
        color: '#ff0000',
        fields: [first, second],
        tables: [],
      },
    ]);
    expect(result.operations).toBeUndefined();
    expect(result.tooltipContent).toBeUndefined();
    expect(result.dataSourceMap).toBeUndefined();
  });
});
