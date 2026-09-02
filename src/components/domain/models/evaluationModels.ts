import { ConfigRules, MetricData, TableMetricData } from './configModels';

export type EvaluatedCandidate = MetricData | TableMetricData;

export interface RuleEvaluation {
  attributes: ConfigRules['attributes'];
  hasMetrics: boolean;
  fields: MetricData[];
  tables: TableMetricData[];
  winner?: EvaluatedCandidate;
  elementWinnerAfterRule?: EvaluatedCandidate;
}

export interface ElementEvaluation {
  id: string;
  rules: RuleEvaluation[];
  winner?: EvaluatedCandidate;
  selectedAttributes?: ConfigRules['attributes'];
}

export interface PanelEvaluation {
  elements: ElementEvaluation[];
}
