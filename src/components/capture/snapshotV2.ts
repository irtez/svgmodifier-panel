import type { PanelOptions } from 'types';
import type { ConfigRules, Diagnostic, Metrics, PanelEvaluation, PreparedRule } from '../domain/models';
import type { PreparedPanelConfig } from '../infrastructure/config/configSetup';
import { NO_DATA_COLOR, type buildPanelPresentation } from '../application/adapters/panelPresentation';
import type { ColorTrace, EvaluationTrace, InputTrace, MetricTrace, SourceTrace } from './trace';
import type {
  DecisionV2,
  ExpressionInputV2,
  IndicatorV2,
  JsonValueV2,
  LinkV2,
  MetricSourceV2,
  MetricV2,
  NavigationV2,
  RuleV2,
  SvgModifierSnapshotV2,
  TableV2,
} from './modelsV2';
import { captureLink, type LinkContext } from './links';
import { capturePaint } from './colors';
import { DiagnosticIndexV2, addIds, sourceLocation } from './diagnosticsV2';
import { captureTooltip } from './tooltipV2';
import { copyJson } from './jsonValues';
import { collectMapObjects } from './mapObjects';

export interface SnapshotInputV2 {
  trace: EvaluationTrace;
  evaluation: PanelEvaluation;
  prepared: PreparedPanelConfig;
  presentation: ReturnType<typeof buildPanelPresentation>;
  tooltipOptions: PanelOptions['tooltip'];
  root: Element | null;
  producerVersion: string;
  panel: SvgModifierSnapshotV2['panel'];
  observed: SvgModifierSnapshotV2['observed'];
  evaluationStatus: SvgModifierSnapshotV2['evaluationStatus'];
  configurationStatus: SvgModifierSnapshotV2['configurationStatus'];
  linkContext: LinkContext;
}

export function buildSnapshotV2(input: SnapshotInputV2): SvgModifierSnapshotV2 {
  const { trace, evaluation } = input;
  const diagnostics = new DiagnosticIndexV2();
  const existing = new Set(evaluation.elements.map((e) => e.id));
  for (const d of evaluation.diagnostics ?? []) {
    diagnostics.add(d, { indicatorIds: (d.elementIds ?? []).filter((id) => existing.has(id)) });
  }
  const links: LinkV2[] = [],
    linkIds = new Map<string, string>();
  const link = (url: string) => {
    let id = linkIds.get(url);
    if (!id) {
      id = 'link-' + links.length;
      linkIds.set(url, id);
      links.push({ id, url, destination: captureLink(url, input.linkContext) });
    }
    return id;
  };
  const navigation = (value: unknown, use: NavigationV2['use'], ruleId?: string): NavigationV2[] =>
    (Array.isArray(value) ? value : [value])
      .filter((v): v is string => typeof v === 'string')
      .map((url) => ({ linkId: link(url), use, ...(ruleId ? { ruleId } : {}) }));
  const rules: RuleV2[] = [],
    ruleByAuthored = new Map<ConfigRules, RuleV2>(),
    ruleByPrepared = new Map<PreparedRule, RuleV2>();
  const addRule = (authored: ConfigRules) => {
    const found = ruleByAuthored.get(authored);
    if (found) {
      return found;
    }
    const id = 'rule-' + rules.length;
    const settings = asArray(authored.attributes.metrics);
    const rule: RuleV2 = {
      id,
      source: sourceLocation(authored.source),
      selectors: Array.isArray(authored.id) ? authored.id.slice() : [authored.id],
      ...stringProperty('title', authored.attributes.title),
      indicatorIds: [],
      queries: settings.flatMap((m, metricsIndex) =>
        (Array.isArray(m?.queries) ? m.queries : []).flatMap((q, queryIndex) =>
          q && typeof q === 'object' && !Array.isArray(q)
            ? [
                {
                  metricsIndex,
                  queryIndex,
                  ...stringProperty('refId', q.refid),
                  ...stringProperty('legend', q.legend),
                  ...stringProperty('label', q.label ?? m.label),
                  ...stringProperty('title', q.title ?? m.title),
                  ...stringProperty('sum', q.sum),
                },
              ]
            : []
        )
      ),
      navigation: navigation(authored.attributes.link, 'declared', id),
      diagnosticIds: [],
    };
    rules.push(rule);
    ruleByAuthored.set(authored, rule);
    return rule;
  };
  trace.rules.forEach(addRule);
  trace.prepared.forEach(({ authored, elementId }, prepared) => {
    const rule = addRule(authored);
    ruleByPrepared.set(prepared, rule);
    if (existing.has(elementId)) {
      addIds(rule.indicatorIds, [elementId]);
    }
  });
  const metrics: MetricV2[] = [],
    metricIndex = new Map<string, MetricV2>();
  const metricByResult = new Map<MetricTrace, string>(),
    candidateIds = new Map<object, string>();
  for (const run of trace.runs) {
    const rule = ruleByPrepared.get(run.prepared);
    if (!rule) {
      throw new Error('CAPTURE_RULE_SOURCE_UNRESOLVED');
    }
    for (const query of run.queries) {
      let unsafeSettings = false;
      const settingsKey = canonical(
        copyJson(query.settings, () => {
          unsafeSettings = true;
        })
      );
      for (const [occurrence, result] of query.results.entries()) {
        const indicatorIds = run.assigned.has(result.slot) && existing.has(run.elementId) ? [run.elementId] : [];
        const context = { indicatorIds, ruleIds: [rule.id] };
        const diagnosticIds: string[] = [];
        const diag = (items: Diagnostic[]) => {
          const ids = items.map((d) => diagnostics.add(d, context));
          addIds(diagnosticIds, ids);
          return [...new Set(ids)];
        };
        diag(result.slot.diagnostics);
        if (unsafeSettings) {
          diag([
            {
              code: 'CAPTURE_NON_JSON_CONFIG',
              severity: 'warning',
              message: 'Настройка содержит непредставимое в JSON значение',
              source: run.prepared.source,
            },
          ]);
        }
        const inputs = (rows: InputTrace[], parents: Diagnostic[]): ExpressionInputV2[] =>
          rows.map((row) => ({
            token: row.token,
            refId: row.refId,
            field: row.field,
            calculation: row.calculation,
            value: row.value ?? null,
            availability: row.value === undefined ? 'unavailable' : 'available',
            diagnosticIds: row.value === undefined ? diag(parents) : [],
          }));
        const decision = (
          value: number,
          displayValue: string | undefined,
          level: number | undefined,
          color: string | undefined,
          recorded?: ColorTrace
        ): DecisionV2 => {
          for (const check of recorded?.checks ?? []) {
            diag(check.diagnostics);
          }
          const index = recorded?.selectedThresholdIndex ?? null;
          const threshold = index === null ? undefined : query.settings.thresholds?.[index];
          const check = recorded?.checks.find((c) => c.index === index);
          return {
            value,
            displayValue: displayValue ?? null,
            level: level ?? null,
            color: color === undefined ? null : capturePaint(color),
            appliedThreshold:
              threshold && index !== null
                ? {
                    index,
                    value: copyJson(threshold.value, () => {
                      throw new Error('CAPTURE_THRESHOLD_INVALID');
                    }) as JsonValueV2,
                    operator: threshold.operator || '>=',
                    level: threshold.lvl ?? index + 1,
                    color: typeof threshold.color === 'string' ? capturePaint(threshold.color) : null,
                    condition: threshold.condition ?? null,
                    inputs: inputs(check?.inputs ?? [], check?.diagnostics ?? []),
                    diagnosticIds: diag(check?.diagnostics ?? []),
                  }
                : null,
          };
        };
        const source = (s: SourceTrace): MetricSourceV2 => {
          const origin = trace.getOrigin(s.field);
          return {
            refId: s.refId,
            legend: origin?.legend ?? s.legend,
            fieldName: origin?.fieldName ?? s.legend,
            frameName: origin?.frameName ?? null,
            frameIndex: origin?.frameIndex ?? null,
            fieldIndex: origin?.fieldIndex ?? null,
            labels: origin?.labels ? { ...origin.labels } : null,
            dataSource: {
              uid: origin?.dataSource.uid ?? null,
              type: origin?.dataSource.type ?? null,
              name: origin?.dataSource.name ?? s.dataSourceName ?? null,
            },
            valueCount: s.valueCount,
            fromMs: s.fromMs,
            toMs: s.toMs,
            calculation: s.calculation,
            value: s.value ?? null,
            diagnosticIds: diag(s.diagnostics),
          };
        };
        const candidate = result.slot.candidate;
        let table: TableV2 | null = null;
        if (result.table) {
          table = {
            columns: result.table.columns.map((c) => ({ ...c })),
            headers:
              candidate && 'headers' in candidate
                ? (copyJson(candidate.headers, () => {
                    throw new Error('CAPTURE_TABLE_HEADERS_INVALID');
                  }) as JsonValueV2[])
                : result.table.columns.map((c) => c.name),
            rowFilterStatus: result.table.rowFilterStatus,
            thresholdColumnIndex: result.table.thresholdColumnIndex,
            winningRowIndex: candidate && 'columnsData' in candidate ? candidate.winningRowIndex ?? null : null,
            rows: result.table.rows.map((row) => {
              const cellIssues: TableV2['rows'][number]['cellIssues'] = [];
              const values = row.values.map((value, columnIndex) => {
                const known = row.issues.find((issue) => issue.columnIndex === columnIndex);
                let invalid = Boolean(known);
                const copied = copyJson(value, () => {
                  invalid = true;
                });
                if (!invalid) {
                  return copied as JsonValueV2;
                }
                const id = diagnostics.add(
                  {
                    code: known?.missing ? 'CAPTURE_MISSING_CELL' : 'CAPTURE_NON_JSON_CELL',
                    severity: 'warning',
                    message: 'Ячейка заменена на null: значение не представимо в JSON',
                    source: { ...run.prepared.source, refId: query.selection.refid },
                  },
                  context,
                  {
                    metricsIndex: query.metricsIndex,
                    queryIndex: query.queryIndex,
                    rowIndex: row.sourceIndex,
                    columnIndex,
                  }
                );
                addIds(diagnosticIds, [id]);
                cellIssues.push({ columnIndex, diagnosticIds: [id] });
                return null;
              });
              return {
                sourceIndex: row.sourceIndex,
                values,
                displayValues: row.display.map((v) => (v === undefined || v === null ? null : String(v))),
                decision: row.decision
                  ? decision(
                      row.decision.value,
                      row.decision.displayValue,
                      row.decision.level,
                      row.decision.color,
                      row.color
                    )
                  : null,
                cellIssues,
              };
            }),
          };
        }
        const sources = result.sources.map(source);
        const scalar =
          candidate && !('columnsData' in candidate)
            ? decision(candidate.metricValue, candidate.displayValue, candidate.lvl, candidate.color, result.color)
            : null;
        const fact: Omit<MetricV2, 'id' | 'indicatorIds'> = {
          ruleId: rule.id,
          query: {
            metricsIndex: query.metricsIndex,
            queryIndex: query.queryIndex,
            counter: query.counter,
            selection:
              query.selection.refid && query.selection.legend
                ? 'refid_and_legend'
                : query.selection.refid
                ? 'refid'
                : query.selection.legend
                ? 'legend'
                : 'none',
            ...stringProperty('refId', query.selection.refid),
            ...stringProperty('legend', query.selection.legend),
          },
          ...stringProperty('label', candidate?.label ?? query.settings.label),
          ...stringProperty('title', candidate?.title ?? query.settings.title),
          ...stringProperty('calculation', query.settings.calculation),
          ...stringProperty('unit', query.settings.unit),
          ...(Number.isFinite(query.settings.decimal) ? { decimal: query.settings.decimal } : {}),
          availability: candidate ? 'available' : 'unavailable',
          kind: table ? 'table' : candidate || result.sources.length ? 'scalar' : 'unresolved',
          sources,
          scalar,
          table,
          diagnosticIds,
        };
        // Only repeated runs can share a result; distinct selection occurrences stay distinct.
        const key = canonical({
          fact,
          occurrence,
          settingsKey,
          filling: candidate?.filling ?? null,
          checks: result.color ?? null,
          tableChecks: result.table?.rows.map((r) => r.color) ?? null,
          unsafe: unsafeSettings ? metrics.length : null,
        });
        let metric = metricIndex.get(key);
        if (!metric) {
          metric = { id: 'metric-' + metrics.length, ...fact, indicatorIds: [] };
          metrics.push(metric);
          metricIndex.set(key, metric);
        }
        addIds(metric.indicatorIds, indicatorIds);
        diagnostics.attach(diagnosticIds, { ...context, metricIds: [metric.id] });
        metricByResult.set(result, metric.id);
        if (candidate) {
          candidateIds.set(candidate, metric.id);
        }
      }
    }
  }
  const expressions = trace.expressions.map((record, index) => {
    const errors = record.diagnostics.slice();
    if (record.skipped) {
      errors.push({
        code: 'EXPRESSION_NOT_EVALUATED',
        severity: 'warning',
        message: record.skipped,
        source: { expressionRefId: record.expression.refId },
      });
    }
    const diagnosticIds = [...new Set(errors.map((d) => diagnostics.add(d)))];
    return {
      id: 'expression-' + index,
      refId: record.expression.refId,
      formula: record.expression.expression,
      availability: record.value === undefined ? ('unavailable' as const) : ('available' as const),
      value: record.value ?? null,
      inputs: record.inputs.map((row) => ({
        ...row,
        value: row.value ?? null,
        availability: row.value === undefined ? ('unavailable' as const) : ('available' as const),
        diagnosticIds: row.value === undefined ? diagnosticIds.slice() : [],
      })),
      diagnosticIds,
    };
  });
  const indicators: IndicatorV2[] = evaluation.elements.map((element) => {
    const runs = trace.runs.filter((run) => run.elementId === element.id);
    const selected = runs.find((run) => run.prepared.attributes === element.selectedAttributes);
    const ruleResults = runs.map((run, index) => {
      const winner = element.rules[index]?.winner;
      return {
        ruleId: ruleByPrepared.get(run.prepared)!.id,
        metricIds: [
          ...new Set(
            run.queries.flatMap((q) =>
              q.results.filter((r) => run.assigned.has(r.slot)).map((r) => metricByResult.get(r)!)
            )
          ),
        ],
        winnerMetricId: winner ? candidateIds.get(winner) ?? null : null,
        winnerRowIndex: winner && 'winningRowIndex' in winner ? winner.winningRowIndex ?? null : null,
      };
    });
    return {
      id: element.id,
      objectIds: [],
      binding: { status: 'unresolved', basis: 'none', candidateObjectIds: [] },
      visible: null,
      appearance: [],
      metricIds: [...new Set(ruleResults.flatMap((r) => r.metricIds))],
      ruleResults,
      state: {
        noData: Boolean(element.noData),
        selectedRuleId: selected ? ruleByPrepared.get(selected.prepared)!.id : null,
        winnerMetricId: element.winner ? candidateIds.get(element.winner) ?? null : null,
        winnerRowIndex:
          element.winner && 'winningRowIndex' in element.winner ? element.winner.winningRowIndex ?? null : null,
        color: element.noData
          ? capturePaint(NO_DATA_COLOR)
          : element.winner?.color === undefined
          ? null
          : capturePaint(element.winner.color),
        level: element.winner?.lvl ?? null,
      },
      tooltip: captureTooltip(
        element,
        input.presentation.tooltipContent?.find((t) => t.id === element.id),
        input.tooltipOptions,
        candidateIds,
        diagnostics
      ),
      navigation: runs.flatMap((run) =>
        navigation(run.prepared.attributes.link, 'prepared', ruleByPrepared.get(run.prepared)!.id)
      ),
      diagnosticIds: [],
    };
  });
  const rulesById = new Map(rules.map((r) => [r.id, r]));
  const metricsById = new Map(metrics.map((m) => [m.id, m]));
  const indicatorsById = new Map(indicators.map((i) => [i.id, i]));
  for (const d of diagnostics.rows) {
    if (!d.ruleIds.length && d.source.path) {
      addIds(
        d.ruleIds,
        rules
          .filter((r) => r.source.path === d.source.path && r.source.pageIndex === d.source.pageIndex)
          .map((r) => r.id)
      );
    }
    const linked = d.metricIds.map((id) => metricsById.get(id)!);
    for (const field of ['metricsIndex', 'queryIndex'] as const) {
      const indices = new Set(linked.map((m) => m.query[field]));
      if (d.source[field] === undefined && indices.size === 1) {
        d.source[field] = linked[0].query[field];
      }
    }
    d.ruleIds.forEach((id) => addIds(rulesById.get(id)!.diagnosticIds, [d.id]));
    d.indicatorIds.forEach((id) => {
      const target = indicatorsById.get(id);
      if (target) {
        addIds(target.diagnosticIds, [d.id]);
      }
    });
  }
  const snapshot: SvgModifierSnapshotV2 = {
    kind: 'svgmodifier',
    schemaVersion: 2,
    producer: { id: 'svgmodifier-panel', version: input.producerVersion },
    panel: input.panel,
    observed: input.observed,
    evaluationStatus: input.evaluationStatus,
    configurationStatus: input.configurationStatus,
    objects: collectMapObjects({
      root: input.root,
      targets: input.prepared.elementsById,
      indicators,
      dynamicText: new Set(
        evaluation.elements.flatMap((element) => {
          const node = input.prepared.elementsById.get(element.id);
          return node && element.selectedAttributes && 'label' in element.selectedAttributes ? [node] : [];
        })
      ),
      navigation: (url) => navigation(url, 'applied'),
    }),
    indicators,
    rules,
    metrics,
    expressions,
    links,
    diagnostics: diagnostics.rows,
  };
  return copyJson(snapshot, () => {
    throw new Error('CAPTURE_PAYLOAD_INVALID');
  }) as unknown as SvgModifierSnapshotV2;
}

function asArray(value: Metrics[] | undefined): Metrics[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function stringProperty<K extends string>(key: K, value: unknown): Partial<Record<K, string>> {
  return typeof value === 'string' ? ({ [key]: value } as Record<K, string>) : {};
}

function canonical(value: unknown): string {
  const sort = (item: unknown): unknown =>
    Array.isArray(item)
      ? item.map(sort)
      : item && typeof item === 'object'
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((k) => [k, sort((item as Record<string, unknown>)[k])])
        )
      : item;
  return JSON.stringify(sort(value));
}
