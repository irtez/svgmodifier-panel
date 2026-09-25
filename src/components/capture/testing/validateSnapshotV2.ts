// Test-only schema and reference checks, shared by the browser reference receiver.
import Ajv from 'ajv';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { DecisionV2, MetricV2, NavigationV2, PaintV2, SvgModifierSnapshotV2 } from '../modelsV2';

const structure = new Ajv({ strict: true, allErrors: true }).compile<SvgModifierSnapshotV2>(
  JSON.parse(readFileSync(resolve(__dirname, '../../../../docs/svgmodifier-snapshot-v2.schema.json'), 'utf8'))
);

function isJson(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value !== 'object' || ancestors.has(value) || ancestors.size >= 64) {
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
  const valid = Object.values(entries).every((e) => e.enumerable && 'value' in e && isJson(e.value, ancestors));
  ancestors.delete(value);
  return valid;
}

export function validateSnapshotV2(value: unknown, context: { panelId: number; maxPayloadBytes: number }): string[] {
  if (!isJson(value)) {
    return ['json'];
  }
  if (!structure(value)) {
    return ['schema'];
  }
  const errors = new Set<string>();
  const check = (condition: unknown, code: string) => {
    if (!condition) {
      errors.add(code);
    }
  };
  const index = <T extends { id: string }>(rows: T[]) => {
    const map = new Map(rows.map((r) => [r.id, r]));
    check(map.size === rows.length, 'duplicate');
    return map;
  };
  const objects = index(value.objects),
    indicators = index(value.indicators),
    metrics = index(value.metrics);
  const rules = index(value.rules),
    links = index(value.links),
    diagnostics = index(value.diagnostics);
  index(value.expressions);
  const refs = (ids: string[], map: ReadonlyMap<string, unknown>) =>
    ids.forEach((id) => check(map.has(id), 'reference'));
  const diags = (row: { diagnosticIds: string[] }) => refs(row.diagnosticIds, diagnostics);
  const paint = (p: PaintV2 | null) => {
    if (p) {
      check((p.kind === 'solid') === (p.rgba !== null), 'state');
    }
  };
  const navigation = (rows: NavigationV2[]) =>
    rows.forEach((n) => {
      refs([n.linkId], links);
      if (n.ruleId) {
        refs([n.ruleId], rules);
      }
    });
  const available = (row: { availability: string; value: number | null }) =>
    check((row.availability === 'available') === (row.value !== null), 'state');
  const decision = (d: DecisionV2) => {
    paint(d.color);
    if (d.appliedThreshold) {
      paint(d.appliedThreshold.color);
      diags(d.appliedThreshold);
      d.appliedThreshold.inputs.forEach((i) => {
        diags(i);
        available(i);
      });
    }
  };
  const offset = (n: number | null, length: number) => check(n === null || n < length, 'index');
  const range = (from: number | null, to: number | null) => check(from === null || to === null || from <= to, 'range');
  const noCycles = (ids: string[], next: (id: string) => string[]) => {
    const visiting = new Set<string>(),
      done = new Set<string>();
    const visit = (id: string) => {
      if (visiting.has(id)) {
        check(false, 'cycle');
        return;
      }
      if (done.has(id)) {
        return;
      }
      visiting.add(id);
      next(id).forEach(visit);
      visiting.delete(id);
      done.add(id);
    };
    ids.forEach(visit);
  };
  check(value.panel.id === context.panelId, 'identity');
  check(Buffer.byteLength(JSON.stringify(value), 'utf8') <= context.maxPayloadBytes, 'size');
  range(value.observed.effectiveFromMs, value.observed.effectiveToMs);
  for (const object of objects.values()) {
    refs(object.indicatorIds, indicators);
    navigation(object.navigation);
    if (object.parentId) {
      refs([object.parentId], objects);
    }
    check((object.parentId === null) === (object.parentRelation === null), 'state');
    object.indicatorIds.forEach((id) => check(indicators.get(id)?.objectIds.includes(object.id), 'binding'));
  }
  noCycles([...objects.keys()], (id) => (objects.get(id)?.parentId ? [objects.get(id)!.parentId!] : []));
  for (const rule of rules.values()) {
    refs(rule.indicatorIds, indicators);
    diags(rule);
    navigation(rule.navigation);
  }
  const winner = (id: string | null, row: number | null, assigned: string[]) => {
    if (id === null) {
      check(row === null, 'winner');
      return;
    }
    const m = metrics.get(id);
    check(m && assigned.includes(id) && m.availability === 'available', 'winner');
    check(
      m?.kind === 'scalar'
        ? row === null && m.scalar !== null
        : m?.kind === 'table' && row !== null && m.table?.winningRowIndex === row,
      'winner'
    );
  };
  for (const metric of metrics.values()) {
    refs([metric.ruleId], rules);
    refs(metric.indicatorIds, indicators);
    diags(metric);
    check(
      metric.kind === 'scalar'
        ? metric.table === null && (metric.availability === 'available') === (metric.scalar !== null)
        : metric.kind === 'table'
        ? metric.scalar === null && metric.table !== null
        : metric.availability === 'unavailable' && metric.scalar === null && metric.table === null,
      'state'
    );
    if (metric.scalar) {
      decision(metric.scalar);
    }
    metric.sources.forEach((source) => {
      diags(source);
      range(source.fromMs, source.toMs);
    });
    metric.indicatorIds.forEach((id) => check(indicators.get(id)?.metricIds.includes(metric.id), 'binding'));
    const table = metric.table;
    if (table) {
      offset(table.thresholdColumnIndex, table.columns.length);
      offset(table.winningRowIndex, table.rows.length);
      check(new Set(table.rows.map((r) => r.sourceIndex)).size === table.rows.length, 'duplicate');
      table.rows.forEach((row) => {
        check(row.values.length === table.columns.length && row.displayValues.length === table.columns.length, 'width');
        if (row.decision) {
          decision(row.decision);
        }
        row.cellIssues.forEach((issue) => {
          offset(issue.columnIndex, row.values.length);
          diags(issue);
          check(row.values[issue.columnIndex] === null, 'state');
        });
      });
      if (table.winningRowIndex !== null) {
        check(table.rows[table.winningRowIndex]?.decision && metric.availability === 'available', 'winner');
      }
    }
  }
  for (const indicator of indicators.values()) {
    refs(indicator.objectIds, objects);
    refs(indicator.binding.candidateObjectIds, objects);
    refs(indicator.metricIds, metrics);
    diags(indicator);
    navigation(indicator.navigation);
    indicator.objectIds.forEach((id) => check(objects.get(id)?.indicatorIds.includes(indicator.id), 'binding'));
    check(
      !['unresolved', 'ambiguous'].includes(indicator.binding.status) || indicator.objectIds.length === 0,
      'binding'
    );
    indicator.appearance.forEach((a) => {
      paint(a.fill);
      paint(a.stroke);
      paint(a.textColor);
    });
    const state = indicator.state;
    paint(state.color);
    if (state.selectedRuleId !== null) {
      refs([state.selectedRuleId], rules);
    }
    winner(state.winnerMetricId, state.winnerRowIndex, indicator.metricIds);
    check(!state.noData || state.winnerMetricId === null, 'winner');
    indicator.metricIds.forEach((id) => check(metrics.get(id)?.indicatorIds.includes(indicator.id), 'binding'));
    for (const r of indicator.ruleResults) {
      refs([r.ruleId], rules);
      refs(r.metricIds, metrics);
      winner(r.winnerMetricId, r.winnerRowIndex, r.metricIds);
      check(rules.get(r.ruleId)?.indicatorIds.includes(indicator.id), 'binding');
      r.metricIds.forEach((id) =>
        check(metrics.get(id)?.ruleId === r.ruleId && indicator.metricIds.includes(id), 'binding')
      );
    }
    const selected = indicator.ruleResults.find((r) => r.ruleId === state.selectedRuleId);
    check(state.selectedRuleId === null || selected, 'winner');
    check(
      (selected?.winnerMetricId ?? null) === state.winnerMetricId &&
        (selected?.winnerRowIndex ?? null) === state.winnerRowIndex,
      'winner'
    );
    diags(indicator.tooltip);
    refs(indicator.tooltip.metricIds, metrics);
    indicator.tooltip.metricIds.forEach((id) => check(indicator.metricIds.includes(id), 'binding'));
    indicator.tooltip.tables.forEach((t) => {
      refs([t.metricId], metrics);
      check(indicator.metricIds.includes(t.metricId), 'binding');
      const m: MetricV2 | undefined = metrics.get(t.metricId);
      check(m?.kind === 'table', 'state');
      t.rowIndices.forEach((n) => offset(n, m?.table?.rows.length ?? 0));
    });
  }
  for (const d of diagnostics.values()) {
    refs(d.indicatorIds, indicators);
    refs(d.ruleIds, rules);
    refs(d.metricIds, metrics);
    refs(d.causeIds, diagnostics);
  }
  noCycles([...diagnostics.keys()], (id) => diagnostics.get(id)?.causeIds ?? []);
  value.expressions.forEach((e) => {
    available(e);
    diags(e);
    e.inputs.forEach((i) => {
      available(i);
      diags(i);
    });
  });
  return [...errors];
}
