import { ConfigRules, MetricData, TableMetricData } from './configModels';
import { Diagnostic } from './diagnosticModels';

export type EvaluatedCandidate = MetricData | TableMetricData;

export interface RuleEvaluation {
  attributes: ConfigRules['attributes'];
  hasMetrics: boolean;
  fields: MetricData[];
  tables: TableMetricData[];
  winner?: EvaluatedCandidate;
  elementWinnerAfterRule?: EvaluatedCandidate;
  diagnostics?: Diagnostic[];
}

export interface ElementEvaluation {
  id: string;
  rules: RuleEvaluation[];
  winner?: EvaluatedCandidate;
  selectedAttributes?: ConfigRules['attributes'];
  noData?: { filling?: string };
}

export interface PanelEvaluation {
  elements: ElementEvaluation[];
  diagnostics?: Diagnostic[];
}
