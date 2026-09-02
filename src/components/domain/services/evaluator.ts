import {
  ConfigRules,
  DataFrameMap,
  EvaluatedCandidate,
  PanelEvaluation,
  RuleEvaluation,
  RulesByElementId,
} from 'components/domain/models';
import { getMetricsData } from './dataHandler';
import { queriesFilter } from './queryFilter';
import { selectBestQuery } from './queryProcessor';

export function evaluatePanel(rulesByElementId: RulesByElementId, data: DataFrameMap): PanelEvaluation {
  const elements: PanelEvaluation['elements'] = [];

  for (const [id, rules] of rulesByElementId) {
    let bestGlobalLvl = Number.NEGATIVE_INFINITY;
    let bestGlobalMetric = Number.NEGATIVE_INFINITY;
    let selectedAttributes: ConfigRules['attributes'] | undefined;
    let winner: EvaluatedCandidate | undefined;
    const evaluatedRules: RuleEvaluation[] = [];

    for (const rule of rules) {
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

      const candidates = queriesFilter(
        getMetricsData(attributes.metrics!, data, attributes.valueMapping),
        selector,
        elemIndex,
        elemsLength,
        attributes.autoConfig
      );
      const selection = selectBestQuery(candidates);

      if (
        selection.bestLvl > bestGlobalLvl ||
        (selection.bestLvl === bestGlobalLvl && selection.bestMetric > bestGlobalMetric)
      ) {
        bestGlobalLvl = selection.bestLvl;
        bestGlobalMetric = selection.bestMetric;
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
      });
    }

    elements.push({
      id,
      rules: evaluatedRules,
      winner,
      selectedAttributes,
    });
  }

  return { elements };
}
