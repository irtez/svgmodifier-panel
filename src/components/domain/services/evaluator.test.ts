import { ConfigRules, DataFrameMap, PreparedRule, RulesByElementId } from 'components/domain/models';
import { evaluatePanel } from './evaluator';

function preparedRule(attributes: ConfigRules['attributes']): PreparedRule {
  return {
    selector: undefined,
    elemIndex: 0,
    elemsLength: 1,
    attributes,
  };
}

describe('evaluatePanel', () => {
  it('keeps static selection and represents an empty dynamic rule explicitly', () => {
    const staticAttributes: ConfigRules['attributes'] = { title: 'Static cell' };
    const emptyAttributes: ConfigRules['attributes'] = {
      title: 'No matching data',
      metrics: [{ queries: [{ refid: 'C', legend: undefined as never }] }],
    };
    const rules: RulesByElementId = new Map([
      ['cell-a', [preparedRule(staticAttributes), preparedRule(emptyAttributes)]],
    ]);

    const result = evaluatePanel(rules, new Map());

    expect(result).toMatchObject({
      elements: [
        {
          id: 'cell-a',
          rules: [
            {
              attributes: staticAttributes,
              hasMetrics: false,
              fields: [],
              tables: [],
              winner: undefined,
              elementWinnerAfterRule: undefined,
            },
            {
              attributes: emptyAttributes,
              hasMetrics: true,
              fields: [],
              tables: [],
              winner: undefined,
              elementWinnerAfterRule: undefined,
            },
          ],
          winner: undefined,
          selectedAttributes: staticAttributes,
        },
      ],
    });
  });

  it('retains candidates and current field/table winner comparisons without DOM values', () => {
    const fieldAttributes: ConfigRules['attributes'] = {
      title: 'Field rule',
      metrics: [
        {
          queries: [
            {
              refid: 'A',
              legend: undefined as never,
              filter: { include: { '': ['metric-a'] }, exclude: {} },
              baseColor: '#00aa00',
              thresholds: [{ value: 5, operator: '>=', color: '#ff0000', lvl: 2 }],
            },
            {
              refid: 'A',
              legend: undefined as never,
              filter: { include: { '': ['metric-b'] }, exclude: {} },
              baseColor: '#00aa00',
              thresholds: [{ value: 5, operator: '>=', color: '#0000ff', lvl: 2 }],
            },
          ],
        },
      ],
    };
    const tableAttributes: ConfigRules['attributes'] = {
      title: 'Table rule',
      metrics: [
        {
          thresholdKey: 'status',
          baseColor: '#00aa00',
          thresholds: [{ value: 4, operator: '>=', color: '#ffaa00', lvl: 2 }],
          queries: [{ refid: 'B', legend: undefined as never }],
        },
      ],
    };
    const rules: RulesByElementId = new Map([
      ['cell-b', [preparedRule(fieldAttributes), preparedRule(tableAttributes)]],
    ]);
    const sourceValues = ['row-a', 'row-b'];
    const data: DataFrameMap = new Map([
      [
        'A',
        {
          values: new Map([
            ['metric-a', { values: ['5'] }],
            ['metric-b', { values: ['5'] }],
          ]),
        },
      ],
      [
        'B',
        {
          type: 'table',
          length: 2,
          values: new Map([
            ['name', { values: sourceValues }],
            ['status', { values: ['2', '5'] }],
          ]),
        },
      ],
    ]);

    const result = evaluatePanel(rules, data);
    const element = result.elements[0];
    const firstField = element.rules[0].fields[0];
    const table = element.rules[1].tables[0];

    expect(
      element.rules[0].fields.map(({ label, color, lvl, metricValue }) => ({
        label,
        color,
        lvl,
        metricValue,
      }))
    ).toEqual([
      { label: 'metric-a', color: '#ff0000', lvl: 2, metricValue: 5 },
      { label: 'metric-b', color: '#0000ff', lvl: 2, metricValue: 5 },
    ]);
    expect(element.rules[0].winner).toBe(firstField);
    expect(table).toMatchObject({
      headers: ['name', 'status'],
      columnsData: [
        { row: ['row-a', '2'], color: '#00aa00', lvl: 0 },
        { row: ['row-b', '5'], color: '#ffaa00', lvl: 2 },
      ],
      color: '#ffaa00',
      lvl: 2,
      metricValue: 5,
    });
    expect(element.rules[1].winner).toBe(table);
    expect(element.rules[1].elementWinnerAfterRule).toBe(firstField);
    expect(element.winner).toBe(firstField);
    expect(element.selectedAttributes).toBe(fieldAttributes);
    expect(table.columnsData[0].row).not.toBe(sourceValues);

    const containsRuntimeValue = (value: unknown): boolean => {
      if (typeof value === 'function' || value instanceof SVGElement) {
        return true;
      }
      if (Array.isArray(value)) {
        return value.some(containsRuntimeValue);
      }
      if (value && typeof value === 'object') {
        return Object.values(value).some(containsRuntimeValue);
      }
      return false;
    };

    expect(containsRuntimeValue(result)).toBe(false);
  });
});
