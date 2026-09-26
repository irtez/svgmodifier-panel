import { FieldType, type PanelData } from '@grafana/data';
import { buildPanelPresentation } from '../application/adapters/panelPresentation';
import { evaluatePanel } from '../domain/services/evaluator';
import { calculateExpressions } from '../domain/utils/calculations';
import { initializeConfig } from '../infrastructure/config/configSetup';
import { getConfig } from '../infrastructure/config/configBuilder';
import { parsePanelConfig } from '../infrastructure/config/parsers';
import { extractFields } from '../infrastructure/data/dataExtractor';
import { FieldSources } from './fieldSources';
import { guardTrace } from './guardTrace';
import { EvaluationTrace, QueryTrace, RuleTrace } from './trace';
import { data, range } from './testing/panelFixture';

const config = `changes:
- id: a
  attributes:
    tooltip: {show: false}
    metrics:
    - queries: [{refid: CALC}]
      baseColor: green
      thresholds: [{value: 80, color: red, lvl: 2, condition: '++globalThis.guardTraceConditions > 0'}]
    - queries: [{refid: T}]
      thresholdKey: Value
      baseColor: green
      thresholds: [{value: 80, color: red, lvl: 2, condition: '++globalThis.guardTraceConditions > 0'}]
`;
const counters = globalThis as unknown as Record<string, number>;
const expression = { refId: 'CALC', expression: '(++globalThis.guardTraceFormulas, $A:last + 1)' };
const timeRange = range();
function panelData(): PanelData {
  const input = data(95, timeRange);
  input.series.push({
    refId: 'T',
    length: 2,
    name: 'Synthetic table',
    meta: { preferredVisualisationType: 'table' },
    fields: [
      { name: 'Node', type: FieldType.string, config: { displayName: 'Node' }, values: ['a', 'b'] },
      { name: 'Value', type: FieldType.number, config: { displayName: 'Value' }, values: [95, 20] },
    ],
  });
  return input;
}

async function run(capture = false, onFailure: () => void = () => undefined) {
  counters.guardTraceFormulas = 0;
  counters.guardTraceConditions = 0;
  const parsed = parsePanelConfig(config);
  const trace = capture ? guardTrace(new EvaluationTrace(parsed.rules), onFailure) : undefined;
  const prepared = initializeConfig(null, parsed.rules, trace);
  const extracted = await extractFields(panelData(), undefined, timeRange, trace);
  const diagnostics = [...parsed.diagnostics, ...(prepared.diagnostics ?? [])];
  const enriched = await calculateExpressions([expression], extracted, timeRange, diagnostics, trace);
  const evaluation = evaluatePanel(
    prepared.rulesByElementId,
    enriched,
    { timeTo: timeRange.to.valueOf(), diagnostics },
    trace
  );
  const presentation = buildPanelPresentation(evaluation, new Map(), {
    mode: 'grid',
    notifySettings: { show: false, threshold: undefined },
  });
  return {
    extracted,
    evaluation,
    presentation,
    formulas: counters.guardTraceFormulas,
    conditions: counters.guardTraceConditions,
  };
}

function crash(): never {
  throw new Error('synthetic recorder failure');
}

afterEach(() => {
  jest.restoreAllMocks();
  delete counters.guardTraceFormulas;
  delete counters.guardTraceConditions;
});

describe('capture-only recorder boundary', () => {
  it.each([
    ['recordField', () => jest.spyOn(FieldSources.prototype, 'recordField').mockImplementation(crash)],
    ['getOrigin', () => jest.spyOn(FieldSources.prototype, 'getOrigin').mockImplementation(crash)],
    [
      'nested row getOrigin',
      () =>
        jest
          .spyOn(FieldSources.prototype, 'getOrigin')
          .mockReturnValueOnce(undefined)
          .mockReturnValueOnce(undefined)
          .mockImplementation(crash),
    ],
    ['preparedRule', () => jest.spyOn(EvaluationTrace.prototype, 'preparedRule').mockImplementation(crash)],
    ['expression', () => jest.spyOn(EvaluationTrace.prototype, 'expression').mockImplementation(crash)],
    ['beginRule', () => jest.spyOn(EvaluationTrace.prototype, 'beginRule').mockImplementation(crash)],
    ['query', () => jest.spyOn(RuleTrace.prototype, 'query').mockImplementation(crash)],
    ['source', () => jest.spyOn(QueryTrace.prototype, 'source').mockImplementation(crash)],
    ['scalar', () => jest.spyOn(QueryTrace.prototype, 'scalar').mockImplementation(crash)],
    ['table', () => jest.spyOn(QueryTrace.prototype, 'table').mockImplementation(crash)],
    ['row', () => jest.spyOn(QueryTrace.prototype, 'row').mockImplementation(crash)],
    ['record', () => jest.spyOn(QueryTrace.prototype, 'record').mockImplementation(crash)],
  ] as Array<[string, () => jest.SpyInstance]>)(
    '[TG01] %s failure preserves extraction, winner, presentation and formula count',
    async (_name, inject) => {
      const baseline = await run();
      expect(baseline.evaluation.elements[0].winner).toMatchObject({ color: 'red', lvl: 2, metricValue: 96 });
      expect(baseline.formulas).toBe(1);
      expect(baseline.evaluation.diagnostics).toEqual([]);
      expect(baseline.conditions).toBe(3);
      inject();
      let failures = 0;
      const captured = await run(true, () => {
        failures++;
      });
      expect(captured).toEqual(baseline);
      expect(failures).toBe(1);
    }
  );

  it('[TG02] preserves actual recorder/data identities and method receiver, including getOrigin', async () => {
    const parsed = parsePanelConfig(config);
    const original = new EvaluationTrace(parsed.rules);
    const runs = original.runs;
    const preparedMap = original.prepared;
    const trace = guardTrace(original, crash);
    expect(trace).toBe(original);
    expect(trace.rules).toBe(parsed.rules);
    expect(trace.runs).toBe(runs);
    expect(trace.prepared).toBe(preparedMap);
    const prepared = initializeConfig(null, parsed.rules, trace);
    const rule = prepared.rulesByElementId.values().next().value![0];
    const ruleTrace = trace.beginRule(rule, 'a');
    expect(ruleTrace).toBe(original.runs[0]);
    expect(ruleTrace.root).toBe(trace);
    expect(ruleTrace.prepared).toBe(rule);
    const extracted = await extractFields(panelData(), undefined, timeRange, trace);
    const field = extracted.get('A')!.values.values().next().value!;
    const getOrigin = trace.getOrigin;
    const origin = getOrigin(field);
    expect(origin).toMatchObject({ fieldName: 'raw_alpha_metric', frameName: 'Synthetic source' });
    expect(origin).toBe(trace.getOrigin(field));
    const queryTrace = ruleTrace.query(0, 0, 1, { refid: 'A' }, getConfig({}, rule.attributes.metrics![0]));
    const source = queryTrace.source('A', 'value', field, []);
    expect(ruleTrace.queries[0]).toBe(queryTrace);
    expect(queryTrace.rule).toBe(ruleTrace);
    expect(queryTrace.sources[0]).toBe(source);
    expect(source.field).toBe(field);
    const scalar = queryTrace.scalar;
    scalar(0);
    expect(queryTrace.current!.sources[0]).toBe(source);
  });

  it('[TG03] disables every existing recorder after one failure, even if the failure callback throws', async () => {
    const parsed = parsePanelConfig(config);
    const original = new EvaluationTrace(parsed.rules);
    jest.spyOn(original, 'expression').mockImplementation(crash);
    let failures = 0;
    const trace = guardTrace(original, () => {
      failures++;
      crash();
    });
    const prepared = initializeConfig(null, parsed.rules, trace);
    const rule = prepared.rulesByElementId.values().next().value![0];
    const ruleTrace = trace.beginRule(rule, 'a');
    const queryTrace = ruleTrace.query(0, 0, 1, { refid: 'A' }, getConfig({}, rule.attributes.metrics![0]));
    const extracted = await extractFields(panelData(), undefined, timeRange, trace);
    const field = extracted.get('A')!.values.values().next().value!;
    expect(trace.expression(expression)).toBeUndefined();
    expect(trace.expression(expression)).toBeUndefined();
    expect(trace.beginRule(rule, 'b')).toBeUndefined();
    expect(trace.getOrigin(field)).toBeUndefined();
    expect(ruleTrace.query(0, 0, 1, { refid: 'A' }, getConfig({}, rule.attributes.metrics![0]))).toBeUndefined();
    expect(queryTrace.source('A', 'value', field, [])).toBeUndefined();
    expect(queryTrace.record({ counter: 1, diagnostics: [] })).toBeUndefined();
    expect(queryTrace.sources).toHaveLength(0);
    expect(queryTrace.results).toHaveLength(0);
    expect(trace.runs).toHaveLength(1);
    expect(ruleTrace.queries).toHaveLength(1);
    expect(trace.expressions).toHaveLength(0);
    expect(failures).toBe(1);
  });

  it('[TG04] decorates a returned recorder only once and leaves plain returned state untouched', () => {
    const parsed = parsePanelConfig(config);
    const original = new EvaluationTrace(parsed.rules);
    const rule = initializeConfig(null, parsed.rules).rulesByElementId.values().next().value![0];
    const child = original.beginRule(rule, 'a');
    jest.spyOn(original, 'beginRule').mockReturnValue(child);
    const trace = guardTrace(original, crash);
    expect(trace.beginRule(rule, 'a')).toBe(child);
    const guardedQuery = child.query;
    expect(trace.beginRule(rule, 'a')).toBe(child);
    expect(child.query).toBe(guardedQuery);
    const recordedExpression = trace.expression(expression);
    expect(recordedExpression).toBe(trace.expressions[0]);
    expect(recordedExpression.expression).toBe(expression);
    expect(Object.getPrototypeOf(recordedExpression)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(recordedExpression.inputs)).toBe(Array.prototype);
  });
});
