import { dateTime, FieldType, LoadingState, type PanelData } from '@grafana/data';
import { parsePanelConfig } from '../../infrastructure/config/parsers';
import { initializeConfig } from '../../infrastructure/config/configSetup';
import { extractFields } from '../../infrastructure/data/dataExtractor';
import { calculateExpressions } from '../../domain/utils/calculations';
import { evaluatePanel } from '../../domain/services/evaluator';
import { buildPanelPresentation } from '../../application/adapters/panelPresentation';
import { EvaluationTrace } from '../trace';
import type { SnapshotInputV2 } from '../snapshotV2';
import type { Expr, PanelOptions } from 'types';

export const graph = (refId: string, name: string, values: unknown[]): PanelData['series'][number] => ({
  refId,
  name: refId + ' frame',
  length: values.length,
  fields: [
    { name: 'time', type: FieldType.time, config: {}, values: values.map((_, i) => i * 1000) },
    { name, type: FieldType.number, config: { displayName: name }, labels: { node: 'alpha' }, values },
  ],
});
export const table = (): PanelData['series'][number] => ({
  refId: 'T',
  name: 'Table frame',
  length: 3,
  meta: { preferredVisualisationType: 'table' },
  fields: [
    { name: 'Node', type: FieldType.string, config: {}, values: ['drop', 'same', 'same'] },
    { name: 'Value', type: FieldType.number, config: { displayName: 'Value' }, values: [100, 95, 0] },
  ],
});
export const config = (queries = '[{refid: A}, {refid: MISSING}]', extra = '') => `changes:
- id: a
  attributes:
    title: Service Alpha
    tooltip: {show: true}
    metrics:
      queries: ${queries}
      label: Reading
      baseColor: green
      decimal: 2
      thresholds: [{value: 10, color: red, lvl: 2}]
      ${extra}
`;

export async function evaluateFixture(
  options: {
    yaml?: string;
    frames?: PanelData['series'];
    expressions?: Expr[];
    svg?: string;
    tooltip?: Partial<PanelOptions['tooltip']>;
    capture?: boolean;
  } = {}
) {
  const timeRange = { from: dateTime(0), to: dateTime(2000), raw: { from: '0', to: '2000' } };
  const parsed = parsePanelConfig(options.yaml ?? config());
  const svg =
    options.svg ??
    '<svg xmlns="http://www.w3.org/2000/svg"><g id="cell-a"><rect width="50" height="30" fill="gray"/></g><g id="cell-b"><rect x="70" width="50" height="30" fill="gray"/></g></svg>';
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = document.importNode(doc.documentElement, true);
  document.body.appendChild(root);
  const trace = options.capture === false ? undefined : new EvaluationTrace(parsed.rules);
  const prepared = initializeConfig(root, parsed.rules, trace);
  const diagnostics = [...parsed.diagnostics, ...(prepared.diagnostics ?? [])];
  const data: PanelData = {
    state: LoadingState.Done,
    timeRange,
    series: options.frames ?? [graph('A', 'latency', [0, 12.34567])],
  };
  const fields = await extractFields(data, undefined, timeRange, trace);
  const enriched = await calculateExpressions(options.expressions ?? [], fields, timeRange, diagnostics, trace);
  const evaluation = evaluatePanel(prepared.rulesByElementId, enriched, { timeTo: 2000, diagnostics }, trace);
  const presentation = buildPanelPresentation(evaluation, prepared.elementsById, {
    mode: 'svg',
    notifySettings: { show: false, threshold: undefined },
  });
  presentation.operations?.forEach((apply) => apply());
  const input: SnapshotInputV2 = {
    trace: trace!,
    evaluation,
    presentation,
    prepared,
    root,
    tooltipOptions: {
      sort: 'none',
      hideZeros: false,
      maxWidth: 400,
      maxHeight: 400,
      valuePosition: 'standard',
      ...options.tooltip,
    },
    producerVersion: '1.4.0',
    panel: { id: 7, mode: 'svg', title: null },
    observed: { generation: 1, dataState: 'Done', effectiveFromMs: 0, effectiveToMs: 2000, evaluatedAtMs: 2001 },
    evaluationStatus: parsed.status === 'invalid' ? 'invalid_configuration' : 'evaluated',
    configurationStatus: { yaml: parsed.status, svg: 'ready' },
    linkContext: {
      documentUrl: 'http://grafana.test/d-solo/example/view',
      baseUrl: 'http://grafana.test/',
      appUrl: 'http://grafana.test/',
    },
  };
  return { input, evaluation, presentation, fields: enriched, root };
}
