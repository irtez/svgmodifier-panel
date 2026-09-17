// Test-only reference validation; not a bounded production receiver or serializer.
import Ajv from 'ajv';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { CapturedMetric, ScalarDecision, SvgModifierSnapshotV1 } from '../models';

const schema = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../docs/svgmodifier-snapshot-v1.schema.json'), 'utf8')
);
const structure = new Ajv({ strict: true, allErrors: true }).compile<SvgModifierSnapshotV1>(schema);

export interface ValidationContext {
  panelId: number;
  maxPayloadBytes: number;
}

// JSON.stringify alone silently changes NaN/holes/undefined and accepts Date/toJSON.
function isJson(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value !== 'object' || ancestors.has(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  if (Array.isArray(value) ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
    return false;
  }
  if (Object.getOwnPropertySymbols(value).length) {
    return false;
  }
  const entries = Object.getOwnPropertyDescriptors(value);
  if (Array.isArray(value)) {
    delete entries.length;
    if (Object.keys(entries).length !== value.length || !Array.from(value.keys()).every((i) => String(i) in entries)) {
      return false;
    }
  }
  ancestors.add(value);
  const valid = Object.values(entries).every(
    (entry) => entry.enumerable && 'value' in entry && isJson(entry.value, ancestors)
  );
  ancestors.delete(value);
  return valid;
}

export function validateSnapshot(value: unknown, context: ValidationContext): string[] {
  if (!isJson(value)) {
    return ['json'];
  }
  if (!structure(value)) {
    return ['schema'];
  }
  const errors = new Set<string>();
  const require = (condition: unknown, code: string) => {
    if (!condition) {
      errors.add(code);
    }
  };
  const index = <T extends { id: string }>(items: T[]) => {
    const result = new Map(items.map((item) => [item.id, item]));
    require(result.size === items.length, 'duplicate');
    return result;
  };
  const rules = index(value.configuration.rules);
  const elements = index(value.elements);
  const metrics = index(value.metrics);
  const diagnostics = index(value.diagnostics);
  const items = index(value.diagram.items);
  index(value.expressions);
  index(value.diagram.connections);

  const refs = (ids: string[], target: ReadonlyMap<string, unknown>) =>
    ids.forEach((id) => require(target.has(id), 'reference'));
  const diags = (entry: { diagnosticIds: string[] }) => refs(entry.diagnosticIds, diagnostics);
  const range = (from: number | null, to: number | null) =>
    require(from === null || to === null || from <= to, 'range');
  const offset = (position: number | null, length: number) => require(position === null || position < length, 'index');
  const availability = (entry: { availability: string; value: number | null }) =>
    require((entry.availability === 'available') === (entry.value !== null), 'state');
  const decision = (result: ScalarDecision, metric: CapturedMetric) => {
    const trace = result.thresholdTrace;
    require(new Set(trace.map((check) => check.index)).size === trace.length, 'duplicate');
    const thresholds = metric.settings.thresholds;
    trace.forEach((check) => {
      diags(check);
      check.inputs.forEach((input) => {
        diags(input);
        availability(input);
      });
      require(Array.isArray(thresholds) && check.index < thresholds.length, 'threshold');
      require(check.matched ===
        (['true', 'not_present'].includes(check.condition) && check.comparison === 'true'), 'threshold');
    });
    const matched = trace.filter((check) => check.matched);
    require(result.selectedThresholdIndex === (matched.length ? matched[matched.length - 1].index : null), 'threshold');
  };
  require(value.panel.id === context.panelId, 'identity');
  require(Buffer.byteLength(JSON.stringify(value), 'utf8') <= context.maxPayloadBytes, 'size');
  range(value.observed.effectiveFromMs, value.observed.effectiveToMs);
  diags(value.configuration);
  diags(value.diagram);

  for (const rule of rules.values()) {
    diags(rule);
    refs(rule.elementIds, elements);
    rule.elementIds.forEach((id) =>
      require(elements.get(id)?.ruleResults.some((result) => result.ruleId === rule.id), 'binding')
    );
  }
  for (const metric of metrics.values()) {
    diags(metric);
    refs([metric.ruleId], rules);
    refs(metric.elementIds, elements);
    const configuredMetrics = rules.get(metric.ruleId)?.attributes.metrics;
    if (Array.isArray(configuredMetrics)) {
      offset(metric.metricsIndex, configuredMetrics.length);
      const configuredMetric = configuredMetrics[metric.metricsIndex];
      if (configuredMetric && typeof configuredMetric === 'object' && !Array.isArray(configuredMetric)) {
        const queries = configuredMetric.queries;
        if (Array.isArray(queries)) {
          offset(metric.queryIndex, queries.length);
        }
      }
    }
    metric.sources.forEach((source) => {
      diags(source);
      range(source.fromMs, source.toMs);
    });
    require(metric.kind === 'scalar'
      ? metric.table === null && (metric.availability === 'available') === (metric.scalar !== null)
      : metric.kind === 'table'
      ? metric.scalar === null && (metric.availability === 'unavailable' || metric.table !== null)
      : metric.availability === 'unavailable' && metric.scalar === null && metric.table === null, 'state');
    if (metric.scalar) {
      decision(metric.scalar, metric);
    }
    if (metric.table) {
      const table = metric.table;
      offset(table.thresholdColumnIndex, table.columns.length);
      offset(table.winningRowIndex, table.rows.length);
      require(metric.availability === 'available' || table.winningRowIndex === null, 'winner');
      require(new Set(table.rows.map((row) => row.sourceIndex)).size === table.rows.length, 'duplicate');
      table.rows.forEach((row) => {
        require(row.values.length === table.columns.length &&
          row.displayValues.length === table.columns.length, 'width');
        row.cellIssues.forEach((issue) => {
          offset(issue.columnIndex, table.columns.length);
          require(issue.diagnosticIds.length > 0, 'state');
          require(row.values[issue.columnIndex] === null, 'state');
          diags(issue);
        });
        if (row.decision) {
          require(table.thresholdColumnIndex !== null, 'state');
          decision(row.decision, metric);
        }
      });
      if (table.winningRowIndex !== null) {
        require(table.rows[table.winningRowIndex]?.decision !== null &&
          table.rows[table.winningRowIndex] !== undefined, 'winner');
      }
    }
    metric.elementIds.forEach((id) =>
      require(elements
        .get(id)
        ?.ruleResults.some((rule) => rule.ruleId === metric.ruleId && rule.metricIds.includes(metric.id)), 'binding')
    );
  }
  for (const element of elements.values()) {
    diags(element);
    if (element.diagramItemId !== null) {
      refs([element.diagramItemId], items);
      require(items.get(element.diagramItemId)?.svgId === element.id, 'binding');
    }
    require(new Set(element.ruleResults.map((rule) => rule.ruleId)).size === element.ruleResults.length, 'duplicate');
    const winner = (metricId: string | null, rowIndex: number | null, allowedIds: string[]) => {
      if (metricId === null) {
        require(rowIndex === null, 'winner');
        return;
      }
      const metric = metrics.get(metricId);
      require(metric &&
        metric.availability === 'available' &&
        allowedIds.includes(metricId) &&
        metric.elementIds.includes(element.id), 'winner');
      if (metric?.kind === 'scalar') {
        require(metric.scalar !== null && rowIndex === null, 'winner');
      } else {
        require(metric?.kind === 'table' && rowIndex !== null && rowIndex === metric.table?.winningRowIndex, 'winner');
      }
    };
    for (const result of element.ruleResults) {
      refs([result.ruleId], rules);
      refs(result.metricIds, metrics);
      require(rules.get(result.ruleId)?.elementIds.includes(element.id), 'binding');
      result.metricIds.forEach((id) => {
        const metric = metrics.get(id);
        require(metric?.ruleId === result.ruleId && metric.elementIds.includes(element.id), 'binding');
      });
      winner(result.winnerMetricId, result.winnerRowIndex, result.metricIds);
    }
    const selected = element.ruleResults.find((rule) => rule.ruleId === element.selectedRuleId);
    require(element.selectedRuleId === null || selected, 'winner');
    winner(element.winnerMetricId, element.winnerRowIndex, selected?.metricIds ?? []);
    require((selected?.winnerMetricId ?? null) === element.winnerMetricId &&
      (selected?.winnerRowIndex ?? null) === element.winnerRowIndex, 'winner');
    require(element.noData === null || element.winnerMetricId === null, 'winner');
  }
  value.expressions.forEach((expression) => {
    diags(expression);
    availability(expression);
    expression.inputs.forEach((input) => {
      diags(input);
      availability(input);
    });
  });
  diagnostics.forEach((diagnostic) => {
    refs(diagnostic.ruleIds, rules);
    refs(diagnostic.elementIds, elements);
    refs(diagnostic.metricIds, metrics);
  });
  const rendered = value.diagram.status === 'rendered';
  require(rendered === (value.diagram.viewport !== null && value.diagram.coordinateSpace !== null), 'state');
  if (!rendered) {
    require(value.diagram.viewport === null && value.diagram.coordinateSpace === null, 'state');
  }
  for (const item of items.values()) {
    diags(item);
    if (item.parentId !== null) {
      refs([item.parentId], items);
    }
    const ancestors = new Set([item.id]);
    let parent = item.parentId;
    while (parent !== null && items.has(parent)) {
      if (ancestors.has(parent)) {
        errors.add('cycle');
        break;
      }
      ancestors.add(parent);
      parent = items.get(parent)!.parentId;
    }
    if (!rendered) {
      require(item.bounds === null &&
        item.paints.length === 0 &&
        item.textFragments.every((text) => text.bounds === null), 'state');
      require(Object.values(item.visibility).every((entry) => entry === null), 'state');
    }
    item.links.declarations.forEach((link) => {
      require((link.origin === 'rule') === (link.ruleId !== null), 'binding');
      if (link.ruleId !== null) {
        refs([link.ruleId], rules);
      }
    });
  }
  value.diagram.connections.forEach((connection) => {
    if (connection.itemId !== null) {
      refs([connection.itemId], items);
    }
    [connection.source, connection.target].forEach((endpoint) => {
      if (endpoint.itemId !== null) {
        refs([endpoint.itemId], items);
        const item = items.get(endpoint.itemId);
        require(item &&
          (endpoint.cellId === null || endpoint.cellId === item.cellId) &&
          (endpoint.svgId === null || endpoint.svgId === item.svgId), 'binding');
      }
    });
  });
  return Array.from(errors);
}
