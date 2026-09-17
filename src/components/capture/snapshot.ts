import type { ConfigRules, Diagnostic, DiagnosticSource, PanelEvaluation, PreparedRule } from '../domain/models';
import type {
  CapturedDiagnostic,
  CapturedElement,
  CapturedMetric,
  CapturedRule,
  CapturedTable,
  ExpressionInput,
  JsonObject,
  MetricSource,
  ScalarDecision,
  SourceLocation,
  SvgModifierSnapshotV1,
} from './models';
import type { ColorTrace, EvaluationTrace, InputTrace, MetricTrace, SourceTrace } from './trace';
import { copyJson } from './jsonValues';

export interface SnapshotInput {
  trace: EvaluationTrace;
  evaluation: PanelEvaluation;
  producerVersion: string;
  panel: SvgModifierSnapshotV1['panel'];
  observed: SvgModifierSnapshotV1['observed'];
  evaluationStatus: SvgModifierSnapshotV1['evaluationStatus'];
  configuration: Pick<SvgModifierSnapshotV1['configuration'], 'yamlStatus' | 'svgStatus'>;
  diagram: SvgModifierSnapshotV1['diagram'];
}

function sourceLocation(source?: DiagnosticSource): SourceLocation {
  return {
    page: source?.page ?? null,
    pageIndex: source?.pageIndex ?? null,
    path: source?.path ?? null,
    line: source?.line ?? null,
    column: source?.column ?? null,
    refId: source?.refId ?? null,
    legend: source?.legend ?? null,
    expressionRefId: source?.expressionRefId ?? null,
    thresholdIndex: source?.thresholdIndex ?? null,
    metricsIndex: null,
    queryIndex: null,
    rowIndex: null,
    columnIndex: null,
  };
}

const textOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/** Adapter читает факты; формулы, reducers, фильтры и пороги здесь не выполняются. */
export function buildSnapshot(input: SnapshotInput): SvgModifierSnapshotV1 {
  const { trace, evaluation } = input;
  const diagnostics: CapturedDiagnostic[] = [];
  const diagnosticIndex = new Map<string, CapturedDiagnostic>();
  const rules: CapturedRule[] = [];
  const ruleIds = new Map<PreparedRule, string>();
  const metrics: CapturedMetric[] = [];
  const candidateIds = new Map<object, string>();
  const metricIds = new Map<MetricTrace, string>();
  const addIds = (target: string[], values: string[]) =>
    values.forEach((id) => {
      if (!target.includes(id)) {
        target.push(id);
      }
    });
  const diagnostic = (
    item: Diagnostic,
    elementIds: string[] = [],
    ruleId?: string,
    metricId?: string,
    location?: Partial<SourceLocation>
  ) => {
    const source = { ...sourceLocation(item.source), ...location };
    const key = JSON.stringify([item.code, item.severity, item.message, source]);
    let result = diagnosticIndex.get(key);
    if (!result) {
      result = {
        id: 'diagnostic-' + diagnostics.length,
        code: item.code,
        severity: item.severity,
        message: item.message,
        source,
        elementIds: [],
        ruleIds: [],
        metricIds: [],
      };
      diagnostics.push(result);
      diagnosticIndex.set(key, result);
    }
    addIds(result.elementIds, elementIds);
    if (ruleId) {
      addIds(result.ruleIds, [ruleId]);
    }
    if (metricId) {
      addIds(result.metricIds, [metricId]);
    }
    return result.id;
  };
  const existingElements = new Set(evaluation.elements.map((element) => element.id));
  evaluation.diagnostics?.forEach((item) =>
    diagnostic(
      item,
      (item.elementIds ?? []).filter((id) => existingElements.has(id))
    )
  );
  const addRule = (prepared: PreparedRule | undefined, authored: ConfigRules, elementId?: string) => {
    const id = 'rule-' + rules.length;
    const diagnosticIds: string[] = [];
    const json = (value: unknown) =>
      copyJson(value, () =>
        addIds(diagnosticIds, [
          diagnostic(
            {
              code: 'CAPTURE_NON_JSON_CONFIG',
              severity: 'warning',
              message: 'Настройка содержит непредставимое в JSON значение',
              source: authored.source,
            },
            [],
            id
          ),
        ])
      );
    rules.push({
      id,
      source: sourceLocation(authored.source),
      selector: json(authored.id),
      attributes: json(prepared?.attributes ?? authored.attributes) as JsonObject,
      authoredAttributes: json(authored.attributes) as JsonObject,
      elementIds: elementId && existingElements.has(elementId) ? [elementId] : [],
      diagnosticIds,
    });
    if (prepared) {
      ruleIds.set(prepared, id);
    }
  };
  trace.prepared.forEach(({ authored, elementId }, prepared) => addRule(prepared, authored, elementId));
  const boundAuthored = new Set([...trace.prepared.values()].map((entry) => entry.authored));
  trace.rules.filter((authored) => !boundAuthored.has(authored)).forEach((authored) => addRule(undefined, authored));
  for (const run of trace.runs) {
    if (!ruleIds.has(run.prepared)) {
      addRule(
        run.prepared,
        { id: run.elementId, attributes: run.prepared.attributes, source: run.prepared.source },
        run.elementId
      );
    }
    for (const query of run.queries) {
      for (const result of query.results) {
        const id = 'metric-' + metrics.length;
        const ruleId = ruleIds.get(run.prepared)!;
        const elementIds = run.assigned.has(result.slot) && existingElements.has(run.elementId) ? [run.elementId] : [];
        const diag = (items: Diagnostic[]) => [
          ...new Set(items.map((item) => diagnostic(item, elementIds, ruleId, id))),
        ];
        const inputs = (items: InputTrace[], parents: Diagnostic[]): ExpressionInput[] =>
          items.map((item) => ({
            token: item.token,
            refId: item.refId,
            field: item.field,
            calculation: item.calculation,
            value: item.value ?? null,
            availability: item.value === undefined ? 'unavailable' : 'available',
            diagnosticIds: item.value === undefined ? diag(parents) : [],
          }));
        const decision = (
          value: number,
          displayValue: string | undefined,
          level: number,
          color: string | undefined,
          recorded?: ColorTrace
        ): ScalarDecision => ({
          value,
          displayValue: displayValue ?? null,
          level,
          color: textOrNull(color),
          selectedThresholdIndex: recorded?.selectedThresholdIndex ?? null,
          thresholdTrace: (recorded?.checks ?? []).map((check) => ({
            index: check.index,
            condition: check.condition,
            comparison: check.comparison,
            matched: check.matched,
            inputs: inputs(check.inputs, check.diagnostics),
            diagnosticIds: diag(check.diagnostics),
          })),
        });
        const metricDiagnosticIds = diag(result.slot.diagnostics);
        const source = (recorded: SourceTrace): MetricSource => {
          const origin = trace.getOrigin(recorded.field);
          return {
            refId: recorded.refId,
            legend: origin?.legend ?? recorded.legend,
            fieldName: origin?.fieldName ?? recorded.legend,
            frameName: origin?.frameName ?? null,
            frameIndex: origin?.frameIndex ?? null,
            fieldIndex: origin?.fieldIndex ?? null,
            labels: origin?.labels ? { ...origin.labels } : null,
            dataSource: {
              uid: origin?.dataSource.uid ?? null,
              type: origin?.dataSource.type ?? null,
              name: origin?.dataSource.name ?? recorded.dataSourceName ?? null,
            },
            valueCount: recorded.valueCount,
            fromMs: recorded.fromMs,
            toMs: recorded.toMs,
            calculation: recorded.calculation,
            value: recorded.value ?? null,
            diagnosticIds: diag(recorded.diagnostics),
          };
        };
        const candidate = result.slot.candidate;
        let table: CapturedTable | null = null;
        if (result.table) {
          table = {
            rowFilterStatus: result.table.rowFilterStatus,
            columns: result.table.columns.map((column) => ({ ...column })),
            thresholdColumnIndex: result.table.thresholdColumnIndex,
            winningRowIndex: candidate && 'columnsData' in candidate ? candidate.winningRowIndex ?? null : null,
            rows: result.table.rows.map((row) => {
              const cellIssues: CapturedTable['rows'][number]['cellIssues'] = [];
              const values = row.values.map((value, columnIndex) => {
                let invalid = row.issues.some((issue) => issue.columnIndex === columnIndex);
                const copied = copyJson(value, () => {
                  invalid = true;
                });
                if (invalid) {
                  const diagnosticId = diagnostic(
                    {
                      code: row.issues.find((issue) => issue.columnIndex === columnIndex)?.missing
                        ? 'CAPTURE_MISSING_CELL'
                        : 'CAPTURE_NON_JSON_CELL',
                      severity: 'warning',
                      message: 'Ячейка заменена на null: значение не представимо в JSON',
                      source: { ...run.prepared.source, refId: query.selection.refid },
                    },
                    elementIds,
                    ruleId,
                    id,
                    {
                      metricsIndex: query.metricsIndex,
                      queryIndex: query.queryIndex,
                      rowIndex: row.sourceIndex,
                      columnIndex,
                    }
                  );
                  cellIssues.push({ columnIndex, diagnosticIds: [diagnosticId] });
                  addIds(metricDiagnosticIds, [diagnosticId]);
                  return null;
                }
                return copied;
              });
              return {
                sourceIndex: row.sourceIndex,
                values,
                displayValues: row.display.map((value) =>
                  value === undefined || value === null ? null : String(value)
                ),
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
        const settings = copyJson(query.settings, () =>
          addIds(metricDiagnosticIds, [
            diagnostic(
              {
                code: 'CAPTURE_NON_JSON_CONFIG',
                severity: 'warning',
                message: 'Настройка содержит непредставимое в JSON значение',
                source: run.prepared.source,
              },
              elementIds,
              ruleId,
              id
            ),
          ])
        ) as JsonObject;
        const metric: CapturedMetric = {
          id,
          ruleId,
          metricsIndex: query.metricsIndex,
          queryIndex: query.queryIndex,
          queryCounter: query.counter,
          selection:
            query.selection.refid && query.selection.legend
              ? 'refid_and_legend'
              : query.selection.refid
              ? 'refid'
              : query.selection.legend
              ? 'legend'
              : 'none',
          selectors: { refId: textOrNull(query.selection.refid), legend: textOrNull(query.selection.legend) },
          sources: result.sources.map(source),
          settings,
          label: textOrNull(candidate?.label),
          title: textOrNull(candidate?.title ?? query.settings.title),
          availability: candidate ? 'available' : 'unavailable',
          kind: table ? 'table' : candidate || result.sources.length ? 'scalar' : 'unresolved',
          scalar:
            candidate && !('columnsData' in candidate)
              ? decision(candidate.metricValue, candidate.displayValue, candidate.lvl, candidate.color, result.color)
              : null,
          table,
          elementIds,
          diagnosticIds: metricDiagnosticIds,
        };
        metrics.push(metric);
        metricIds.set(result, id);
        if (candidate) {
          candidateIds.set(candidate, id);
        }
      }
    }
  }
  const elements: CapturedElement[] = evaluation.elements.map((element) => {
    const runs = trace.runs.filter((run) => run.elementId === element.id);
    const selected = runs.find((run) => run.prepared.attributes === element.selectedAttributes);
    return {
      id: element.id,
      title: typeof element.selectedAttributes?.title === 'string' ? element.selectedAttributes.title : null,
      label: null,
      diagramItemId: null,
      ruleResults: runs.map((run, index) => {
        const winner = element.rules[index].winner;
        return {
          ruleId: ruleIds.get(run.prepared)!,
          metricIds: run.queries.flatMap((query) =>
            query.results.filter((result) => run.assigned.has(result.slot)).map((result) => metricIds.get(result)!)
          ),
          winnerMetricId: winner ? candidateIds.get(winner) ?? null : null,
          winnerRowIndex: winner && 'winningRowIndex' in winner ? winner.winningRowIndex ?? null : null,
        };
      }),
      selectedRuleId: selected ? ruleIds.get(selected.prepared)! : null,
      winnerMetricId: element.winner ? candidateIds.get(element.winner) ?? null : null,
      winnerRowIndex:
        element.winner && 'winningRowIndex' in element.winner ? element.winner.winningRowIndex ?? null : null,
      noData: element.noData ? { filling: element.noData.filling ?? null } : null,
      diagnosticIds: [],
    };
  });
  const expressions = trace.expressions.map((recorded, index) => {
    const errors = [...recorded.diagnostics];
    if (recorded.skipped) {
      errors.push({
        code: 'EXPRESSION_NOT_EVALUATED',
        severity: 'warning',
        message: recorded.skipped,
        source: { expressionRefId: recorded.expression.refId },
      });
    }
    const diagnosticIds = errors.map((item) => diagnostic(item));
    return {
      id: 'expression-' + index,
      refId: recorded.expression.refId,
      formula: recorded.expression.expression,
      value: recorded.value ?? null,
      availability: recorded.value === undefined ? ('unavailable' as const) : ('available' as const),
      inputs: recorded.inputs.map((item) => ({
        ...item,
        value: item.value ?? null,
        availability: item.value === undefined ? ('unavailable' as const) : ('available' as const),
        diagnosticIds: item.value === undefined ? diagnosticIds.slice() : [],
      })),
      diagnosticIds,
    };
  });
  for (const item of diagnostics) {
    const linked = metrics.filter((metric) => item.metricIds.includes(metric.id));
    const metricsIndices = new Set(linked.map((metric) => metric.metricsIndex));
    const queryIndices = new Set(linked.map((metric) => metric.queryIndex));
    item.source.metricsIndex ??= metricsIndices.size === 1 ? linked[0].metricsIndex : null;
    item.source.queryIndex ??= queryIndices.size === 1 ? linked[0].queryIndex : null;
    const inferRules = item.ruleIds.length === 0;
    rules.forEach((rule) => {
      if (
        inferRules &&
        rule.source.path &&
        rule.source.path === item.source.path &&
        rule.source.pageIndex === item.source.pageIndex
      ) {
        addIds(item.ruleIds, [rule.id]);
      }
    });
    item.ruleIds.forEach((id) => addIds(rules.find((rule) => rule.id === id)!.diagnosticIds, [item.id]));
    item.elementIds.forEach((id) => {
      const element = elements.find((element) => element.id === id);
      if (element) {
        addIds(element.diagnosticIds, [item.id]);
      }
    });
  }
  const result: SvgModifierSnapshotV1 = {
    kind: 'svgmodifier',
    schemaVersion: 1,
    producer: { id: 'svgmodifier-panel', version: input.producerVersion },
    panel: { ...input.panel },
    observed: { ...input.observed },
    evaluationStatus: input.evaluationStatus,
    configuration: {
      ...input.configuration,
      rules,
      diagnosticIds: diagnostics.filter((item) => !item.metricIds.length).map((item) => item.id),
    },
    elements,
    metrics,
    expressions,
    diagnostics,
    diagram: input.diagram,
  };
  // Окончательная копия отделяет metadata/config от объектов текущего React run.
  return copyJson(result, () => {
    throw new Error('Непредставимое значение в готовом снимке');
  }) as unknown as SvgModifierSnapshotV1;
}
