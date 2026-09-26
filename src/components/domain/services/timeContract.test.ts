import { parseYamlConfig } from 'components/infrastructure/config/parsers';
import { initializeConfig } from 'components/infrastructure/config/configSetup';
import { evaluatePanel } from './evaluator';

it('[T05,T09] live $date сохраняет текущий UTC-день, история не зависит от реальных часов', () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-01-02T01:00:00Z'));
  try {
    const prepared = initializeConfig(
      null,
      parseYamlConfig(
        `changes:\n  - id: a\n    attributes:\n      metrics:\n        queries: [{refid: A, filter: '$date'}]`
      )
    );
    const data = new Map([
      [
        'A',
        {
          values: new Map([
            ['2026-01-01', { values: ['1'] }],
            ['2026-01-02', { values: ['2'] }],
          ]),
        },
      ],
    ]);
    const valueAt = (timeTo: number) =>
      evaluatePanel(prepared.rulesByElementId, data, { timeTo, diagnostics: [] }).elements[0].winner?.metricValue;
    const liveTo = Date.now(); // now-3h → now: берём только день правой границы.
    expect(valueAt(liveTo)).toBe(2);
    const historicalTo = Date.parse('2026-01-01T23:00:00Z');
    expect(valueAt(historicalTo)).toBe(1);
    jest.setSystemTime(new Date('2027-03-04T12:00:00Z'));
    expect(valueAt(historicalTo)).toBe(1);
    expect(valueAt(liveTo)).toBe(2);
  } finally {
    jest.useRealTimers();
  }
});
