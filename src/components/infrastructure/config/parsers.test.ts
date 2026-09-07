import { parseFilter, parsePanelConfig, parseYamlConfig, resolveFilterDates } from './parsers';

describe('panel configuration parsing diagnostics', () => {
  it('C04 merges rules from pages and preserves their originating source', () => {
    const result = parsePanelConfig([
      { page: 'Overview', code: 'changes:\n  - id: first\n    attributes: { title: First }' },
      { page: 'Details', code: 'changes:\n  - id: second\n    attributes: { title: Second }' },
    ]);

    expect(result.status).toBe('ready');
    expect(result.diagnostics).toEqual([]);
    expect(result.rules.map((rule) => [rule.id, rule.source])).toEqual([
      ['first', { page: 'Overview', pageIndex: 0, path: 'changes[0]', line: 2, column: 5 }],
      ['second', { page: 'Details', pageIndex: 1, path: 'changes[0]', line: 2, column: 5 }],
    ]);
  });

  it('C04 accepts anchors declared outside changes', () => {
    const result = parsePanelConfig(
      'thresholds: &limits\n  - { color: red, value: 10 }\nchanges:\n  - id: a\n    attributes:\n      metrics:\n        thresholds: *limits'
    );

    expect(result).toMatchObject({ status: 'ready', diagnostics: [] });
    expect(result.rules[0].attributes.metrics).toMatchObject({ thresholds: [{ color: 'red', value: 10 }] });
  });

  it('C11 keeps an empty changes list ready', () => {
    expect(parsePanelConfig('changes: []')).toEqual({ rules: [], diagnostics: [], status: 'ready' });
  });

  it('C01 distinguishes blank YAML from invalid YAML', () => {
    expect(parsePanelConfig(' \n\t')).toEqual({ rules: [], diagnostics: [], status: 'empty' });

    const invalid = parsePanelConfig('changes: [');
    expect(invalid.status).toBe('invalid');
    expect(invalid.rules).toEqual([]);
    expect(invalid.diagnostics[0]).toMatchObject({ code: 'YAML_PARSE_ERROR', severity: 'error' });
  });

  it('C12 keeps independent valid rules when a malformed rule is present', () => {
    const result = parsePanelConfig(
      'changes:\n  - id: valid\n    attributes: { title: Works }\n  - id: 123\n    attributes: bad\n  - id: also-valid\n    attributes: {}'
    );

    expect(result.status).toBe('ready');
    expect(result.rules.map((rule) => rule.id)).toEqual(['valid', 'also-valid']);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'INVALID_RULE',
        severity: 'warning',
        source: expect.objectContaining({ path: 'changes[1]' }),
      }),
    ]);
  });

  it('C02 keeps metrics object and array inputs intact', () => {
    const result = parsePanelConfig(
      'changes:\n  - id: one\n    attributes: { metrics: { queries: [{ refid: A }] } }\n  - id: two\n    attributes: { metrics: [{ queries: [{ refid: B }] }] }'
    );

    expect(result.rules[0].attributes.metrics).toMatchObject({ queries: [{ refid: 'A' }] });
    expect(result.rules[1].attributes.metrics).toMatchObject([{ queries: [{ refid: 'B' }] }]);
  });

  it('C13 warns about unknown calculation but retains the fallback rule', () => {
    const result = parsePanelConfig(
      'changes:\n  - id: a\n    attributes: { metrics: { queries: [{ refid: A, calculation: average }] } }'
    );

    expect(result.rules).toHaveLength(1);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'UNKNOWN_CALCULATION',
        severity: 'warning',
        source: expect.objectContaining({ refId: 'A' }),
      }),
    ]);
  });

  it('C14 warns about unknown threshold operators without rejecting the rule', () => {
    const result = parsePanelConfig(
      'changes:\n  - id: a\n    attributes: { metrics: { thresholds: [{ color: red, value: 1, operator: ~~ }] } }'
    );

    expect(result.rules).toHaveLength(1);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'UNKNOWN_OPERATOR',
        severity: 'warning',
        source: expect.objectContaining({ thresholdIndex: 0 }),
      }),
    ]);
  });

  it('C15 leaves unknown top-level declarations alone', () => {
    const result = parsePanelConfig(
      'future_defaults: { anything: permitted }\nchanges:\n  - id: a\n    attributes: {}'
    );

    expect(result).toMatchObject({ status: 'ready', diagnostics: [] });
    expect(result.rules).toHaveLength(1);
  });

  it('C16 keeps the legacy wrapper compatible', () => {
    expect(parseYamlConfig('changes:\n  - id: a\n    attributes: {}')).toMatchObject([{ id: 'a', attributes: {} }]);
    expect(parseYamlConfig('')).toBeNull();
    expect(parseYamlConfig('changes: [')).toBeNull();
  });

  it('C17 converts alias expansion failures into diagnostics', () => {
    const repeatedAlias = Array.from({ length: 10001 }, () => '  - *rule').join('\n');
    const result = parsePanelConfig(`rule: &rule { id: a, attributes: {} }\nchanges:\n${repeatedAlias}`);

    expect(result).toMatchObject({ status: 'invalid', rules: [] });
    expect(result.diagnostics).toEqual([expect.objectContaining({ code: 'YAML_RESOLUTION_ERROR', severity: 'error' })]);
  });

  it('C18 reports malformed nested settings without dropping neighboring valid rules', () => {
    const result = parsePanelConfig(
      'changes:\n  - id: broken-fragments\n    attributes:\n      metrics:\n        - queries: { refid: A }\n          thresholds: null\n        - null\n  - id: valid\n    attributes: {}'
    );

    expect(result.rules.map((rule) => rule.id)).toEqual(['broken-fragments', 'valid']);
    expect(result.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(['INVALID_QUERIES', 'INVALID_METRIC'])
    );
  });

  it('C19 warns when no page contains a changes block', () => {
    const result = parsePanelConfig('anchors: &defaults { title: Plain }\nchagnes: []');

    expect(result).toMatchObject({ status: 'ready', rules: [] });
    expect(result.diagnostics).toEqual([expect.objectContaining({ code: 'MISSING_CHANGES', severity: 'warning' })]);
  });

  it('C04 permits an anchors-only page when another page has changes', () => {
    const result = parsePanelConfig([
      { page: 'Definitions', code: 'defaults: &defaults { title: Shared }' },
      { page: 'Rules', code: 'changes:\n  - id: a\n    attributes: *defaults' },
    ]);

    expect(result).toMatchObject({ status: 'ready', diagnostics: [] });
    expect(result.rules).toHaveLength(1);
  });
});

describe('filter date resolution', () => {
  it('C22 preserves date tokens while parsing the filter structure', () => {
    expect(parseFilter('day:$date|$date-1,-kind:archive')).toEqual({
      include: { day: ['$date', '$date-1'] },
      exclude: { kind: ['archive'] },
    });
  });

  it('T10 resolves dates across a month and year boundary in UTC', () => {
    const filter = parseFilter('day:$date|$date-1|$date-2')!;

    expect(resolveFilterDates(filter, Date.UTC(2025, 0, 1, 0, 0, 0))).toEqual({
      include: { day: ['2025-01-01', '2024-12-31', '2024-12-30'] },
      exclude: {},
    });
  });

  it('T06 uses the UTC day at midnight rather than the local calendar day', () => {
    const filter = parseFilter('$date')!;

    expect(resolveFilterDates(filter, Date.UTC(2025, 5, 1, 0, 0, 0))).toEqual({
      include: { '': ['2025-06-01'] },
      exclude: {},
    });
  });

  it('T07 resolves an historical range from its supplied timeTo', () => {
    const filter = parseFilter('day:$date-14')!;

    expect(resolveFilterDates(filter, Date.UTC(2020, 2, 1, 12))).toEqual({
      include: { day: ['2020-02-16'] },
      exclude: {},
    });
  });

  it('T08 resolves the same prepared filter repeatedly without mutating it', () => {
    const filter = parseFilter('day:$date-1,-archive')!;

    expect(resolveFilterDates(filter, Date.UTC(2025, 0, 2))).toEqual({
      include: { day: ['2025-01-01'] },
      exclude: { '': ['archive'] },
    });
    expect(resolveFilterDates(filter, Date.UTC(2025, 0, 3))).toEqual({
      include: { day: ['2025-01-02'] },
      exclude: { '': ['archive'] },
    });
    expect(filter).toEqual({ include: { day: ['$date-1'] }, exclude: { '': ['archive'] } });
  });

  it('T04 resolves a live now minus three hours from an explicit fixed timeTo', () => {
    const filter = parseFilter('$date')!;
    const nowMinusThreeHours = Date.UTC(2025, 4, 1, 1, 30) - 3 * 60 * 60 * 1000;

    expect(resolveFilterDates(filter, nowMinusThreeHours)).toEqual({ include: { '': ['2025-04-30'] }, exclude: {} });
  });
});
