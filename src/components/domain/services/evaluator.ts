import {
  ConfigRules,
  DataFrameMap,
  EvaluatedCandidate,
  PanelEvaluation,
  RuleEvaluation,
  RulesByElementId,
  Diagnostic,
  EvaluationContext,
} from 'components/domain/models';
import { getMetricsData } from './dataHandler';
import type { EvaluationTrace } from 'components/capture/trace';
import { queriesFilter } from './queryFilter';
import { selectBestQuery } from './queryProcessor';

const bindingErrors = new Set(['MISSING_ELEMENT', 'UNMATCHED_PATTERN', 'INVALID_PATTERN', 'INVALID_SELECTOR']);

export function evaluatePanel(
  rulesByElementId: RulesByElementId,
  data: DataFrameMap,
  context: EvaluationContext = { timeTo: Date.now(), diagnostics: [] },
  capture?: EvaluationTrace
): PanelEvaluation {
  const elements: PanelEvaluation['elements'] = [];
  const diagnostics = [...context.diagnostics];

  for (const [id, rules] of rulesByElementId) {
    let bestGlobalLvl = Number.NEGATIVE_INFINITY;
    let selectedAttributes: ConfigRules['attributes'] | undefined;
    let winner: EvaluatedCandidate | undefined;
    const evaluatedRules: RuleEvaluation[] = [];
    let firstDynamicAttributes: ConfigRules['attributes'] | undefined;
    let noDataFilling: string | undefined;
    let noDataAttributes: ConfigRules['attributes'] | undefined;
    let hasUnavailableMetric = false;

    for (const rule of rules) {
      const ruleCapture = capture?.beginRule(rule, id);
      const { attributes, selector, elemIndex, elemsLength } = rule;
      const hasMetrics = Boolean(attributes?.metrics?.length);

      if (!hasMetrics) {
        if (selectedAttributes === undefined) {
          selectedAttributes = attributes;
        }
        evaluatedRules.push({
          attributes,
          hasMetrics: false,
          fields: [],
          tables: [],
          winner: undefined,
          elementWinnerAfterRule: undefined,
        });
        continue;
      }

      firstDynamicAttributes ??= attributes;
      const ruleContext = {
        ...context,
        diagnostics: [] as Diagnostic[],
        inputDiagnostics: context.diagnostics,
        source: rule.source,
        elementIds: [id],
      };
      const allCandidates = getMetricsData(
        attributes.metrics!,
        data,
        attributes.valueMapping,
        ruleContext,
        ruleCapture
      );
      const candidates = queriesFilter(allCandidates, selector, elemIndex, elemsLength, attributes.autoConfig);
      if (ruleCapture) {
        ruleCapture.assigned = new Set(candidates.slots);
      }
      const autoDistribution = attributes.autoConfig && !selector?.length;
      if (autoDistribution) {
        // У неудачного расчёта есть источник, но нет назначенного значка.
        // Сохраняем его для общего результата, не смешивая с tooltip соседней метрики.
        diagnostics.push(
          ...(allCandidates.slots ?? [])
            .filter((slot) => !slot.candidate)
            .flatMap((slot) => slot.diagnostics.map((diagnostic) => ({ ...diagnostic, elementIds: [] })))
        );
      }
      const ruleDiagnostics = candidates.slots?.flatMap((slot) => slot.diagnostics) ?? [];
      // Ошибки настройки принадлежат правилу, не всем соседним правилам элемента.
      ruleDiagnostics.push(
        ...context.diagnostics
          .filter(
            (diagnostic) =>
              diagnostic.source?.path &&
              diagnostic.source.path === rule.source?.path &&
              diagnostic.source.pageIndex === rule.source?.pageIndex &&
              !bindingErrors.has(diagnostic.code)
          )
          .map((diagnostic) => ({ ...diagnostic, elementIds: [id] }))
      );
      const unavailableSlot = candidates.slots?.find((slot) => !slot.candidate);
      if (!candidates.slots?.length || unavailableSlot) {
        hasUnavailableMetric = true;
        noDataAttributes ??= attributes;
        noDataFilling ??=
          unavailableSlot?.filling ?? allCandidates.slots?.[0]?.filling ?? attributes.metrics?.[0]?.filling;
      }
      // Связываем причины только назначенных результатов, в том числе цепочки формул.
      const visited = new Set<Diagnostic>();
      const bindCauses = (diagnostic: Diagnostic) => {
        for (const cause of diagnostic.causes ?? []) {
          if (!visited.has(cause)) {
            visited.add(cause);
            ruleDiagnostics.push({ ...cause, elementIds: [id] });
            bindCauses(cause);
          }
        }
      };
      ruleDiagnostics.slice().forEach(bindCauses);
      diagnostics.push(...ruleDiagnostics);
      const selection = selectBestQuery(candidates);

      if (selection.bestLvl > bestGlobalLvl) {
        bestGlobalLvl = selection.bestLvl;
        winner = selection.winner;
        selectedAttributes = attributes;
      }

      evaluatedRules.push({
        attributes,
        hasMetrics: true,
        fields: candidates.fields ?? [],
        tables: candidates.tables ?? [],
        winner: selection.winner,
        elementWinnerAfterRule: winner,
        ...(ruleDiagnostics.length ? { diagnostics: ruleDiagnostics } : {}),
      });
    }

    const noData = firstDynamicAttributes && !winner && hasUnavailableMetric;
    elements.push({
      id,
      rules: evaluatedRules,
      winner,
      selectedAttributes: noData ? noDataAttributes : selectedAttributes ?? firstDynamicAttributes,
      ...(noData ? { noData: { filling: noDataFilling } } : {}),
    });
  }

  return { elements, diagnostics: mergeDiagnostics(diagnostics, rulesByElementId) };
}

function mergeDiagnostics(diagnostics: Diagnostic[], rules: RulesByElementId): Diagnostic[] {
  const unique = new Map<string, Diagnostic>();
  for (const diagnostic of diagnostics) {
    const key = JSON.stringify([diagnostic.code, diagnostic.severity, diagnostic.message, diagnostic.source]);
    const ids = new Set([...(unique.get(key)?.elementIds ?? []), ...(diagnostic.elementIds ?? [])]);
    // Ошибка нормализации ещё не знает DOM, но сохранила путь исходного правила.
    if (!diagnostic.elementIds && diagnostic.source?.path && !bindingErrors.has(diagnostic.code)) {
      for (const [id, elementRules] of rules) {
        if (
          elementRules.some(
            (rule) =>
              rule.source?.path === diagnostic.source?.path && rule.source?.pageIndex === diagnostic.source?.pageIndex
          )
        ) {
          ids.add(id);
        }
      }
    }
    unique.set(key, { ...diagnostic, ...(ids.size ? { elementIds: [...ids] } : {}) });
  }
  return [...unique.values()];
}
