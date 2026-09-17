/* Generated from docs/svgmodifier-snapshot-v1.schema.json. Run npm run capture:types. */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | {
      [k: string]: JsonValue;
    };
export type Calculation = 'last' | 'total' | 'max' | 'min' | 'count' | 'delta';

/**
 * Complete facts from one panel evaluation. Cross-reference, state and index invariants are documented in capture-contract.md.
 */
export interface SvgModifierSnapshotV1 {
  kind: 'svgmodifier';
  schemaVersion: 1;
  producer: {
    id: 'svgmodifier-panel';
    version: string;
  };
  panel: {
    id: number;
    mode: 'svg' | 'grid' | 'table';
    title: string | null;
  };
  observed: {
    generation: number;
    dataState: 'Done' | 'Error';
    effectiveFromMs: number;
    effectiveToMs: number;
    evaluatedAtMs: number;
  };
  evaluationStatus: 'evaluated' | 'invalid_configuration' | 'failed';
  configuration: {
    yamlStatus: 'ready' | 'empty' | 'invalid';
    svgStatus: 'ready' | 'empty' | 'invalid' | 'not_evaluated';
    rules: CapturedRule[];
    diagnosticIds: string[];
  };
  elements: CapturedElement[];
  metrics: CapturedMetric[];
  expressions: CapturedExpression[];
  diagnostics: CapturedDiagnostic[];
  diagram: CapturedDiagram;
}
export interface CapturedRule {
  id: string;
  source: SourceLocation;
  selector: JsonValue;
  attributes: JsonObject;
  elementIds: string[];
  diagnosticIds: string[];
}
export interface SourceLocation {
  page: string | null;
  pageIndex: number | null;
  path: string | null;
  line: number | null;
  column: number | null;
  metricsIndex: number | null;
  queryIndex: number | null;
  thresholdIndex: number | null;
  rowIndex: number | null;
  columnIndex: number | null;
  refId: string | null;
  legend: string | null;
  expressionRefId: string | null;
}
export interface JsonObject {
  [k: string]: JsonValue;
}
export interface CapturedElement {
  id: string;
  diagramItemId: string | null;
  title: string | null;
  label: string | null;
  ruleResults: RuleResult[];
  selectedRuleId: string | null;
  winnerMetricId: string | null;
  winnerRowIndex: number | null;
  noData: {
    filling: string | null;
  } | null;
  diagnosticIds: string[];
}
export interface RuleResult {
  ruleId: string;
  metricIds: string[];
  winnerMetricId: string | null;
  winnerRowIndex: number | null;
}
export interface CapturedMetric {
  id: string;
  ruleId: string;
  metricsIndex: number;
  queryIndex: number;
  queryCounter: number;
  selection: 'refid' | 'legend' | 'refid_and_legend';
  selectors: {
    refId: string | null;
    legend: string | null;
  };
  sources: MetricSource[];
  label: string | null;
  title: string | null;
  settings: JsonObject;
  availability: 'available' | 'unavailable';
  kind: 'scalar' | 'table' | 'unresolved';
  scalar: ScalarDecision | null;
  table: CapturedTable | null;
  elementIds: string[];
  diagnosticIds: string[];
}
export interface MetricSource {
  refId: string | null;
  legend: string | null;
  fieldName: string | null;
  frameName: string | null;
  frameIndex: number | null;
  fieldIndex: number | null;
  labels: {
    [k: string]: string;
  } | null;
  dataSource: {
    uid: string | null;
    type: string | null;
    name: string | null;
  };
  valueCount: number | null;
  fromMs: number | null;
  toMs: number | null;
  calculation: Calculation | null;
  value: number | null;
  diagnosticIds: string[];
}
export interface ScalarDecision {
  value: number;
  displayValue: string | null;
  level: number;
  color: string | null;
  selectedThresholdIndex: number | null;
  thresholdTrace: ThresholdCheck[];
}
export interface ThresholdCheck {
  index: number;
  condition: 'true' | 'false' | 'error' | 'not_evaluated' | 'not_present';
  comparison: 'true' | 'false' | 'error' | 'not_evaluated';
  matched: boolean;
  inputs: ExpressionInput[];
  diagnosticIds: string[];
}
export interface ExpressionInput {
  token: string;
  refId: string;
  field: string | null;
  calculation: Calculation;
  value: number | null;
  availability: 'available' | 'unavailable';
  diagnosticIds: string[];
}
export interface CapturedTable {
  columns: Array<{
    name: string;
    type: string | null;
  }>;
  rows: TableRow[];
  thresholdColumnIndex: number | null;
  winningRowIndex: number | null;
}
export interface TableRow {
  sourceIndex: number;
  values: JsonValue[];
  displayValues: Array<string | null>;
  decision: ScalarDecision | null;
  cellIssues: Array<{
    columnIndex: number;
    diagnosticIds: string[];
  }>;
}
export interface CapturedExpression {
  id: string;
  refId: string;
  formula: string;
  inputs: ExpressionInput[];
  availability: 'available' | 'unavailable';
  value: number | null;
  diagnosticIds: string[];
}
export interface CapturedDiagnostic {
  id: string;
  code: string;
  severity: 'error' | 'warning';
  message: string;
  source: SourceLocation;
  elementIds: string[];
  ruleIds: string[];
  metricIds: string[];
}
export interface CapturedDiagram {
  status: 'rendered' | 'not_rendered' | 'invalid' | 'missing';
  coordinateSpace: 'svg-viewport-css-pixels' | null;
  viewport: Bounds | null;
  items: DiagramItem[];
  connections: DiagramConnection[];
  diagnosticIds: string[];
}
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface DiagramItem {
  id: string;
  svgId: string | null;
  cellId: string | null;
  parentId: string | null;
  tag: string;
  sourceKind: string | null;
  order: number;
  authoredText: string | null;
  textFragments: Array<{
    text: string;
    source: 'svg_text' | 'html_text';
    bounds: Bounds | null;
  }>;
  bounds: Bounds | null;
  visibility: {
    display: string | null;
    visibility: string | null;
    opacity: number | null;
  };
  paints: NodePaint[];
  links: {
    declarations: Array<{
      origin: 'svg' | 'rule';
      ruleId: string | null;
      value: JsonValue;
    }>;
    applied: string | null;
  };
  diagnosticIds: string[];
}
export interface NodePaint {
  markers: {
    start: string | null;
    mid: string | null;
    end: string | null;
  };
  nodePath: number[];
  svgId: string | null;
  tag: string;
  fill: Paint | null;
  stroke: Paint | null;
  textColor: Paint | null;
  opacity: number | null;
  fillOpacity: number | null;
  strokeOpacity: number | null;
}
export interface Paint {
  css: string;
  rgba: [number, number, number, number] | null;
}
export interface DiagramConnection {
  id: string;
  itemId: string | null;
  origin: 'drawio';
  source: DiagramEndpoint;
  target: DiagramEndpoint;
  markers: {
    start: string | null;
    end: string | null;
  };
}
export interface DiagramEndpoint {
  cellId: string | null;
  svgId: string | null;
  itemId: string | null;
}
