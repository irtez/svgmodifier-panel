/* Generated from docs/svgmodifier-snapshot-v2.schema.json. Run npm run capture:types. */

export type Index = number;
export type Time = number;
export type Id = string;
export type Ids = Id[];
export type JsonValueV2 =
  | string
  | number
  | boolean
  | null
  | JsonValueV2[]
  | {
      [k: string]: JsonValueV2;
    };

export interface SvgModifierSnapshotV2 {
  kind: 'svgmodifier';
  schemaVersion: 2;
  producer: {
    id: 'svgmodifier-panel';
    version: string;
  };
  panel: {
    id: Index;
    mode: 'svg' | 'grid' | 'table';
    title: string | null;
  };
  observed: {
    generation: number;
    dataState: 'Done' | 'Error';
    effectiveFromMs: Time;
    effectiveToMs: Time;
    evaluatedAtMs: Time;
  };
  evaluationStatus: 'evaluated' | 'invalid_configuration' | 'failed';
  configurationStatus: {
    yaml: 'ready' | 'empty' | 'invalid';
    svg: 'ready' | 'empty' | 'invalid' | 'not_evaluated';
  };
  objects: MapObjectV2[];
  indicators: IndicatorV2[];
  metrics: MetricV2[];
  rules: RuleV2[];
  expressions: ExpressionV2[];
  links: LinkV2[];
  diagnostics: DiagnosticV2[];
}
export interface MapObjectV2 {
  id: Id;
  kind: 'object' | 'group' | 'annotation';
  name: null | {
    text: string;
    source: 'visible_text';
  };
  indicatorIds: Ids;
  parentId: string | null;
  parentRelation: 'direct' | 'inferred' | null;
  navigation: NavigationV2[];
}
export interface NavigationV2 {
  linkId: Id;
  use: 'declared' | 'prepared' | 'applied';
  ruleId?: Id;
}
export interface IndicatorV2 {
  id: Id;
  objectIds: Ids;
  binding: {
    status: 'direct' | 'inferred' | 'ambiguous' | 'unresolved';
    basis: 'own_text' | 'containment' | 'row_alignment' | 'none';
    candidateObjectIds: Ids;
  };
  visible: boolean | null;
  appearance: AppearanceV2[];
  metricIds: Ids;
  ruleResults: RuleResultV2[];
  state: {
    noData: boolean;
    selectedRuleId: string | null;
    winnerMetricId: string | null;
    winnerRowIndex: Index | null;
    color: PaintV2 | null;
    level: number | null;
  };
  tooltip: TooltipV2;
  navigation: NavigationV2[];
  diagnosticIds: Ids;
}
export interface AppearanceV2 {
  part: string;
  fill: PaintV2 | null;
  stroke: PaintV2 | null;
  textColor: PaintV2 | null;
  opacity: number | null;
  effectiveOpacity: number | null;
  fillOpacity: number | null;
  strokeOpacity: number | null;
}
export interface PaintV2 {
  kind: 'solid' | 'none' | 'other';
  css: string;
  rgba: null | [number, number, number, number];
}
export interface RuleResultV2 {
  ruleId: Id;
  metricIds: Ids;
  winnerMetricId: string | null;
  winnerRowIndex: Index | null;
}
export interface TooltipV2 {
  status: 'available' | 'disabled' | 'empty' | 'not_rendered';
  metricIds: Id[];
  tables: Array<{
    metricId: Id;
    rowIndices: Index[];
    title?: string;
  }>;
  textAbove: string[];
  textBelow: string[];
  diagnosticIds: Ids;
  noData: boolean;
}
export interface MetricV2 {
  id: Id;
  ruleId: Id;
  query: {
    metricsIndex: Index;
    queryIndex: Index;
    counter: number;
    selection: 'refid' | 'legend' | 'refid_and_legend' | 'none';
    refId?: string;
    legend?: string;
  };
  label?: string;
  title?: string;
  calculation?: string;
  unit?: string;
  decimal?: number;
  availability: 'available' | 'unavailable';
  kind: 'scalar' | 'table' | 'unresolved';
  sources: MetricSourceV2[];
  scalar: DecisionV2 | null;
  table: TableV2 | null;
  indicatorIds: Ids;
  diagnosticIds: Ids;
}
export interface MetricSourceV2 {
  refId: string | null;
  legend: string | null;
  fieldName: string | null;
  frameName: string | null;
  frameIndex: Index | null;
  fieldIndex: Index | null;
  labels: {
    [k: string]: string;
  } | null;
  dataSource: {
    uid: string | null;
    type: string | null;
    name: string | null;
  };
  valueCount: Index;
  fromMs: Time | null;
  toMs: Time | null;
  calculation: string | null;
  value: number | null;
  diagnosticIds: Ids;
}
export interface DecisionV2 {
  value: number;
  displayValue: string | null;
  level: number | null;
  color: PaintV2 | null;
  appliedThreshold: AppliedThresholdV2 | null;
}
export interface AppliedThresholdV2 {
  index: Index;
  value: JsonValueV2;
  operator: string;
  level: number | null;
  color: PaintV2 | null;
  condition: string | null;
  inputs: ExpressionInputV2[];
  diagnosticIds: Ids;
}
export interface ExpressionInputV2 {
  token: string;
  refId: string;
  field: string | null;
  calculation: string;
  value: number | null;
  availability: 'available' | 'unavailable';
  diagnosticIds: Ids;
}
export interface TableV2 {
  columns: Array<{
    name: string;
    type: string | null;
  }>;
  headers: JsonValueV2[];
  rows: Array<{
    sourceIndex: Index;
    values: JsonValueV2[];
    displayValues: Array<string | null>;
    decision: DecisionV2 | null;
    cellIssues: Array<{
      columnIndex: Index;
      diagnosticIds: Ids;
    }>;
  }>;
  thresholdColumnIndex: Index | null;
  winningRowIndex: Index | null;
  rowFilterStatus: 'applied' | 'not_evaluated' | 'incomplete';
}
export interface RuleV2 {
  id: Id;
  source: SourceLocationV2;
  selectors: string[];
  title?: string;
  indicatorIds: Ids;
  queries: QueryHintV2[];
  navigation: NavigationV2[];
  diagnosticIds: Ids;
}
export interface SourceLocationV2 {
  page?: string;
  pageIndex?: Index;
  path?: string;
  line?: Index;
  column?: Index;
  refId?: string;
  legend?: string;
  expressionRefId?: string;
  metricsIndex?: Index;
  queryIndex?: Index;
  thresholdIndex?: Index;
  rowIndex?: Index;
  columnIndex?: Index;
}
export interface QueryHintV2 {
  metricsIndex: Index;
  queryIndex: Index;
  refId?: string;
  legend?: string;
  label?: string;
  title?: string;
  sum?: string;
}
export interface ExpressionV2 {
  id: Id;
  refId: string;
  formula: string;
  availability: 'available' | 'unavailable';
  value: number | null;
  inputs: ExpressionInputV2[];
  diagnosticIds: Ids;
}
export interface LinkV2 {
  id: Id;
  url: string;
  destination: CapturedLinkDestination | null;
}
export interface CapturedLinkDestination {
  dashboardUid: string;
  panelId: Index | null;
  path: string;
  query: Array<[string, string]>;
}
export interface DiagnosticV2 {
  id: Id;
  code: string;
  severity: 'error' | 'warning';
  message: string;
  source: SourceLocationV2;
  indicatorIds: Ids;
  ruleIds: Ids;
  metricIds: Ids;
  causeIds: Ids;
}
