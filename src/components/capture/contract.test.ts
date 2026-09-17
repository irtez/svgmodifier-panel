import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { SvgModifierSnapshotV1 } from './models';
import { validateSnapshot } from './testing/validateSnapshot';

function fixture(name = 'capture-v1'): SvgModifierSnapshotV1 {
  return JSON.parse(readFileSync(resolve(__dirname, '../../../docs/examples', name + '.json'), 'utf8'));
}

// Invalid cases deliberately bypass TypeScript: the receiving boundary sees unknown data.
function set(value: unknown, path: string, replacement: unknown) {
  const keys = path.split('.');
  let parent = value as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) {
    parent = parent[key] as Record<string, unknown>;
  }
  parent[keys[keys.length - 1]] = replacement;
}

const context = { panelId: 7, maxPayloadBytes: 1024 * 1024 };

describe('capture v1 contract', () => {
  it.each(['capture-v1', 'capture-invalid-v1'])('accepts the complete %s example', (name) => {
    expect(validateSnapshot(fixture(name), context)).toEqual([]);
  });

  it.each([
    [
      'grid without invented geometry',
      [
        ['panel.mode', 'grid'],
        [
          'diagram',
          {
            status: 'not_rendered',
            coordinateSpace: null,
            viewport: null,
            items: [],
            connections: [],
            diagnosticIds: [],
          },
        ],
        ['elements.0.diagramItemId', null],
        ['elements.1.diagramItemId', null],
      ],
    ],
    ['legacy table mode', [['panel.mode', 'table']]],
    ['partial query error with useful results', [['observed.dataState', 'Error']]],
    ['invalid threshold kept as data', [['metrics.0.settings.thresholds.0.value', 'not a number']]],
    [
      'unassigned missing selection',
      [
        ['metrics.1.elementIds', []],
        ['elements.0.ruleResults.0.metricIds', ['metric-alpha']],
      ],
    ],
    ['repeated column names', [['metrics.2.table.columns.2.name', 'Value']]],
    ['raw boolean cell', [['metrics.2.table.rows.1.values.2', false]]],
    ['raw object cell', [['metrics.2.table.rows.1.values.2', { state: 'unknown', count: null }]]],
    ['gradient without fabricated RGB', [['diagram.items.1.paints.0.fill', { css: 'url(#gradient)', rgba: null }]]],
    ['authored and substituted labels differ', [['diagram.items.2.textFragments.0.text', 'Latency']]],
    ['independent visible paint and decision', [['diagram.items.1.paints.0.fill', { css: 'none', rgba: null }]]],
  ] as Array<[string, Array<[string, unknown]>]>)('accepts %s', (_name, changes) => {
    const value = fixture();
    changes.forEach(([path, replacement]) => set(value, path, replacement));
    expect(validateSnapshot(value, context)).toEqual([]);
  });

  it('keeps raw precision, zero, null, source names and disabled-tooltip diagnostics', () => {
    const value = fixture();
    expect(validateSnapshot(value, context)).toEqual([]);
    expect(value.metrics[0].scalar?.value).toBe(12.3456789012);
    expect(value.metrics[0].scalar?.displayValue).toBe('12.35');
    expect(value.metrics[0].label).toBe('Latency');
    expect(value.metrics[0].sources[0].legend).toBe('alpha_latency');
    expect(value.metrics[2].table?.rows[1].values).toEqual(['worker-b', 0, null]);
    expect(value.configuration.rules[0].attributes.tooltip).toEqual({ show: false });
    expect(value.elements[0].winnerMetricId).toBe('metric-alpha');
    expect(value.elements[0].diagnosticIds).toEqual(['missing-input']);
    expect(value.diagram.items.find((item) => item.id === 'static')).toBeDefined();
    expect(value.elements.find((item) => item.id === 'static-green')).toBeUndefined();
    expect(value.diagram.connections[0].target).toEqual({ cellId: 'unknown-cell', svgId: null, itemId: null });
  });

  it('keeps scalar inputs of a threshold condition independently of plugin expressions', () => {
    const value = fixture();
    set(value, 'metrics.0.settings.thresholds.0.condition', '$CHECK:last > 0');
    set(value, 'metrics.0.scalar.thresholdTrace.0.condition', 'true');
    set(value, 'metrics.0.scalar.thresholdTrace.0.inputs', [
      {
        token: '$CHECK:last',
        refId: 'CHECK',
        field: 'Value',
        calculation: 'last',
        value: 0.125,
        availability: 'available',
        diagnosticIds: [],
      },
    ]);
    expect(validateSnapshot(value, context)).toEqual([]);
    set(value, 'metrics.0.scalar.thresholdTrace.0.inputs.0.availability', 'unavailable');
    expect(validateSnapshot(value, context)).toContain('state');
    set(value, 'metrics.0.scalar.thresholdTrace.0.inputs.0.value', null);
    set(value, 'metrics.0.scalar.thresholdTrace.0.inputs.0.diagnosticIds', ['unknown']);
    expect(validateSnapshot(value, context)).toContain('reference');
  });

  it('keeps a readable table without a numeric threshold or invented winner', () => {
    const value = fixture();
    set(value, 'metrics.2.table.thresholdColumnIndex', null);
    set(value, 'metrics.2.table.winningRowIndex', null);
    set(value, 'metrics.2.table.rows.0.decision', null);
    set(value, 'metrics.2.table.rows.1.decision', null);
    set(value, 'elements.1.winnerMetricId', null);
    set(value, 'elements.1.winnerRowIndex', null);
    set(value, 'elements.1.ruleResults.0.winnerMetricId', null);
    set(value, 'elements.1.ruleResults.0.winnerRowIndex', null);
    expect(validateSnapshot(value, context)).toEqual([]);
  });

  it('keeps visible SVG markers without inventing a draw.io connection', () => {
    const value = fixture();
    value.diagram.connections = [];
    set(value, 'diagram.items.1.paints.0.markers', {
      start: 'none',
      mid: 'none',
      end: 'url(#arrowhead)',
    });
    expect(validateSnapshot(value, context)).toEqual([]);
  });

  it('retains rows and a cell issue when a table calculation is unavailable', () => {
    const value = fixture();
    set(value, 'metrics.2.availability', 'unavailable');
    set(value, 'metrics.2.table.winningRowIndex', null);
    set(value, 'metrics.2.table.rows.0.values.1', null);
    set(value, 'metrics.2.table.rows.0.displayValues.1', null);
    set(value, 'metrics.2.table.rows.0.decision', null);
    set(value, 'metrics.2.table.rows.0.cellIssues', [{ columnIndex: 1, diagnosticIds: ['missing-input'] }]);
    set(value, 'elements.1.winnerMetricId', null);
    set(value, 'elements.1.winnerRowIndex', null);
    set(value, 'elements.1.ruleResults.0.winnerMetricId', null);
    set(value, 'elements.1.ruleResults.0.winnerRowIndex', null);
    expect(validateSnapshot(value, context)).toEqual([]);
  });

  it.each([
    ['schema version', 'schemaVersion', 2, 'schema'],
    ['producer', 'producer.id', 'other-panel', 'schema'],
    ['kind', 'kind', 'table', 'schema'],
    ['unknown top-level field', 'health', 'healthy', 'schema'],
    ['omitted collection', 'diagnostics', undefined, 'json'],
    ['fractional timestamp', 'observed.effectiveFromMs', 0.5, 'schema'],
    ['unsafe timestamp', 'observed.effectiveFromMs', Number.MAX_SAFE_INTEGER + 1, 'schema'],
    ['nonterminal data', 'observed.dataState', 'Loading', 'schema'],
    ['zero generation', 'observed.generation', 0, 'schema'],
    ['negative index', 'metrics.0.queryIndex', -1, 'schema'],
    ['metrics index outside rule', 'metrics.0.metricsIndex', 99, 'index'],
    ['query index outside metrics', 'metrics.0.queryIndex', 99, 'index'],
    ['zero query counter', 'metrics.0.queryCounter', 0, 'schema'],
    ['unknown runtime property', 'metrics.0.points', [], 'schema'],
    ['NaN scalar', 'metrics.0.scalar.value', NaN, 'json'],
    ['infinite cell', 'metrics.2.table.rows.0.values.1', Infinity, 'json'],
    ['undefined cell', 'metrics.2.table.rows.0.values.1', undefined, 'json'],
    ['runtime Date', 'metrics.0.settings.date', new Date(0), 'json'],
    ['runtime Map', 'metrics.0.settings.map', new Map(), 'json'],
    ['runtime function', 'metrics.0.settings.callback', () => 1, 'json'],
    ['bigint', 'metrics.0.settings.big', BigInt(1), 'json'],
    ['reversed window', 'observed.effectiveFromMs', 1700003600001, 'range'],
    ['reversed source window', 'metrics.0.sources.0.fromMs', 1700003600001, 'range'],
    ['duplicate metric ID', 'metrics.1.id', 'metric-alpha', 'duplicate'],
    ['duplicate diagram ID', 'diagram.items.2.id', 'alpha', 'duplicate'],
    ['malformed diagnostic entry', 'diagnostics.1', null, 'schema'],
    ['dangling diagnostic', 'metrics.0.diagnosticIds', ['unknown'], 'reference'],
    ['dangling rule', 'metrics.0.ruleId', 'unknown', 'reference'],
    ['dangling metric', 'elements.0.ruleResults.0.metricIds', ['unknown'], 'reference'],
    ['dangling diagram link', 'elements.0.diagramItemId', 'unknown', 'reference'],
    ['dangling source diagnostic', 'metrics.0.sources.0.diagnosticIds', ['unknown'], 'reference'],
    ['dangling expression diagnostic', 'expressions.0.inputs.0.diagnosticIds', ['unknown'], 'reference'],
    ['unknown parent', 'diagram.items.1.parentId', 'unknown', 'reference'],
    ['cyclic parent', 'diagram.items.0.parentId', 'alpha', 'cycle'],
    ['unrelated diagram binding', 'elements.0.diagramItemId', 'static', 'binding'],
    ['unrelated rule binding', 'elements.0.ruleResults.0.metricIds', ['metric-table'], 'binding'],
    ['absent reverse assignment', 'metrics.0.elementIds', [], 'binding'],
    ['absent reverse rule binding', 'configuration.rules.0.elementIds', ['cell-alpha', 'cell-table'], 'binding'],
    ['dropped selected winner', 'elements.0.winnerMetricId', null, 'winner'],
    ['unavailable winner', 'elements.0.winnerMetricId', 'metric-missing', 'winner'],
    ['cross-element winner', 'elements.0.winnerMetricId', 'metric-table', 'winner'],
    ['unknown selected rule', 'elements.0.selectedRuleId', 'rule-table', 'winner'],
    ['no-data with winner', 'elements.0.noData', { filling: 'fill' }, 'winner'],
    ['row index on scalar winner', 'elements.0.winnerRowIndex', 0, 'winner'],
    ['row index outside table', 'metrics.2.table.winningRowIndex', 2, 'index'],
    ['different element and table winner', 'elements.1.winnerRowIndex', 1, 'winner'],
    ['column index outside table', 'metrics.2.table.thresholdColumnIndex', 3, 'index'],
    ['wrong row width', 'metrics.2.table.rows.0.values', ['worker-a'], 'width'],
    ['wrong display width', 'metrics.2.table.rows.0.displayValues', [], 'width'],
    [
      'cell issue without null replacement',
      'metrics.2.table.rows.0.cellIssues',
      [{ columnIndex: 1, diagnosticIds: ['missing-input'] }],
      'state',
    ],
    [
      'cell issue outside row',
      'metrics.2.table.rows.0.cellIssues',
      [{ columnIndex: 3, diagnosticIds: ['missing-input'] }],
      'index',
    ],
    ['selected threshold outside trace', 'metrics.0.scalar.selectedThresholdIndex', 1, 'threshold'],
    ['selected threshold not matched', 'metrics.0.scalar.thresholdTrace.0.matched', false, 'threshold'],
    [
      'duplicate threshold trace index',
      'metrics.0.scalar.thresholdTrace.1',
      { index: 0, condition: 'not_present', comparison: 'true', matched: true, inputs: [], diagnosticIds: [] },
      'duplicate',
    ],
    ['unavailable scalar with result', 'metrics.0.availability', 'unavailable', 'state'],
    ['available scalar without result', 'metrics.0.scalar', null, 'state'],
    ['unresolved selection with result', 'metrics.0.kind', 'unresolved', 'state'],
    ['unavailable expression with number', 'expressions.0.availability', 'unavailable', 'state'],
    ['unavailable input with number', 'expressions.0.inputs.0.availability', 'unavailable', 'state'],
    ['missing rendered viewport', 'diagram.viewport', null, 'state'],
    ['unrendered measured diagram', 'diagram.status', 'not_rendered', 'state'],
    ['invalid rgba alpha', 'diagram.items.1.paints.0.fill.rgba.3', 2, 'schema'],
    ['invalid bounds', 'diagram.items.0.bounds.width', -1, 'schema'],
    ['dangling connection', 'diagram.connections.0.itemId', 'unknown', 'reference'],
    ['inconsistent resolved endpoint', 'diagram.connections.0.source.itemId', 'static', 'binding'],
    ['dangling configured link rule', 'diagram.items.1.links.declarations.0.ruleId', 'unknown', 'reference'],
  ] as Array<[string, string, unknown, string]>)('rejects %s', (_name, path, replacement, code) => {
    const value = fixture();
    set(value, path, replacement);
    expect(validateSnapshot(value, context)).toContain(code);
  });

  it('rejects duplicate rule and diagnostic IDs', () => {
    const value = fixture();
    value.configuration.rules.push(value.configuration.rules[0]);
    value.diagnostics.push(value.diagnostics[0]);
    expect(validateSnapshot(value, context)).toContain('duplicate');
  });

  it('rejects cyclic values and sparse arrays before serialization can lose information', () => {
    const value = fixture();
    set(value, 'metrics.0.settings.circular', value);
    expect(validateSnapshot(value, context)).toContain('json');
    const sparse = fixture();
    delete sparse.metrics[2].table!.rows[0].values[0];
    expect(validateSnapshot(sparse, context)).toContain('json');
  });

  it('checks the requested panel independently of the schema', () => {
    expect(validateSnapshot(fixture(), { ...context, panelId: 8 })).toContain('identity');
  });

  it('enforces the full UTF-8 payload budget, including exact boundary', () => {
    const value = fixture(); // Contains non-ASCII diagnostic text.
    const bytes = Buffer.byteLength(JSON.stringify(value), 'utf8');
    expect(bytes).toBeGreaterThan(JSON.stringify(value).length);
    expect(validateSnapshot(value, { ...context, maxPayloadBytes: bytes })).toEqual([]);
    expect(validateSnapshot(value, { ...context, maxPayloadBytes: bytes - 1 })).toContain('size');
  });
});
