import { ConfigRules } from 'components/domain/models';
import { initializeConfig } from './configSetup';

function svgDocument(): Document {
  return new DOMParser().parseFromString(
    '<svg xmlns="http://www.w3.org/2000/svg"><g id="cell-a"/><g id="cell-b"/></svg>',
    'image/svg+xml'
  );
}

describe('initializeConfig', () => {
  it('separates prepared rules from exact and regex DOM matches', () => {
    const config: ConfigRules[] = [
      { id: 'a', attributes: { title: 'Exact' } },
      { id: 'cell-[ab]', attributes: { title: 'Regex' } },
    ];

    const result = initializeConfig(svgDocument(), config);

    expect(Array.from(result.elementsById.keys())).toEqual(['cell-a', 'cell-b']);
    expect(Array.from(result.rulesByElementId.entries())).toEqual([
      [
        'cell-a',
        [
          { selector: [], elemIndex: 0, elemsLength: 1, attributes: { title: 'Exact' } },
          { selector: [], elemIndex: 0, elemsLength: 2, attributes: { title: 'Regex' } },
        ],
      ],
      ['cell-b', [{ selector: [], elemIndex: 1, elemsLength: 2, attributes: { title: 'Regex' } }]],
    ]);
  });

  it('C08 omits missing SVG IDs while keeping rules available when SVG is absent', () => {
    const config: ConfigRules[] = [{ id: 'missing', attributes: { title: 'Missing' } }];

    const svgResult = initializeConfig(svgDocument(), config);
    const nonSvgResult = initializeConfig(null, config);

    expect(svgResult.rulesByElementId.size).toBe(0);
    expect(svgResult.elementsById.size).toBe(2);
    expect(Array.from(nonSvgResult.rulesByElementId.entries())).toEqual([
      ['cell-missing', [{ selector: [], elemIndex: 0, elemsLength: 1, attributes: { title: 'Missing' } }]],
    ]);
    expect(nonSvgResult.elementsById.size).toBe(0);
  });

  it('C05 reports missing exact SVG IDs while grid mode stays diagnostic-free', () => {
    const config: ConfigRules[] = [
      {
        id: 'missing',
        source: { page: 'Synthetic', pageIndex: 0, path: 'changes[0]' },
        attributes: { title: 'Missing' },
      },
    ];

    const svgResult = initializeConfig(svgDocument(), config);
    const gridResult = initializeConfig(null, config);

    expect(svgResult.diagnostics).toEqual([
      {
        code: 'MISSING_ELEMENT',
        severity: 'error',
        message: 'SVG-элемент "cell-missing" не найден',
        source: { page: 'Synthetic', pageIndex: 0, path: 'changes[0]' },
      },
    ]);
    expect(gridResult.diagnostics).toEqual([]);
  });

  it('C06,C07 report invalid and unmatched regex selectors without affecting exact matches', () => {
    const config: ConfigRules[] = [
      { id: 'cell-[', source: { path: 'changes[0]' }, attributes: {} },
      { id: 'cell-z.*', source: { path: 'changes[1]' }, attributes: {} },
      { id: 'a:@not-a-selector', source: { path: 'changes[2]' }, attributes: {} },
    ];

    const result = initializeConfig(svgDocument(), config);

    expect(result.rulesByElementId.size).toBe(0);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'INVALID_PATTERN', severity: 'error', source: { path: 'changes[0]' } }),
      expect.objectContaining({ code: 'UNMATCHED_PATTERN', severity: 'warning', source: { path: 'changes[1]' } }),
      expect.objectContaining({ code: 'INVALID_SELECTOR', severity: 'warning', source: { path: 'changes[2]' } }),
    ]);
  });

  it('C20 isolates malformed direct metric fragments without throwing away valid metrics', () => {
    const config = [
      {
        id: 'a',
        source: { path: 'changes[0]' },
        attributes: {
          metrics: [
            null,
            { queries: [{ refid: 'A' }, null, { refid: 'B', filter: 'day:$date' }], thresholds: { value: 1 } },
          ],
        },
      },
    ] as unknown as ConfigRules[];

    const result = initializeConfig(svgDocument(), config);
    const metrics = result.rulesByElementId.get('cell-a')![0].attributes.metrics!;

    expect(metrics).toEqual([
      { queries: [{ refid: 'A' }, { refid: 'B', filter: { include: { day: ['$date'] }, exclude: {} } }] },
    ]);
    expect(result.diagnostics?.map((item) => item.code)).toEqual(
      expect.arrayContaining(['INVALID_METRIC', 'INVALID_QUERY', 'INVALID_THRESHOLDS'])
    );
  });

  it('C21 rejects non-finite, fractional, empty, and excessive selectors without expanding a rule', () => {
    const config: ConfigRules[] = [
      { id: 'a:@Infinity', attributes: {} },
      { id: 'a:@1.5', attributes: {} },
      { id: 'a:@1-', attributes: {} },
      { id: 'a:@1-10001', attributes: {} },
    ];

    const result = initializeConfig(svgDocument(), config);

    expect(result.rulesByElementId.size).toBe(0);
    expect(result.diagnostics?.filter((item) => item.code === 'INVALID_SELECTOR')).toHaveLength(4);
  });
});
