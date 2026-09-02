import { ConfigRules } from 'components/domain/models';
import { initializeConfig } from './configSetup';

jest.mock('yaml', () => ({
  __esModule: true,
  default: { parse: jest.fn() },
}));

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
      [
        'cell-b',
        [{ selector: [], elemIndex: 1, elemsLength: 2, attributes: { title: 'Regex' } }],
      ],
    ]);
  });

  it('omits missing SVG IDs while keeping rules available when SVG is absent', () => {
    const config: ConfigRules[] = [{ id: 'missing', attributes: { title: 'Missing' } }];

    const svgResult = initializeConfig(svgDocument(), config);
    const nonSvgResult = initializeConfig(null, config);

    expect(svgResult.rulesByElementId.size).toBe(0);
    expect(svgResult.elementsById.size).toBe(2);
    expect(Array.from(nonSvgResult.rulesByElementId.entries())).toEqual([
      [
        'cell-missing',
        [{ selector: [], elemIndex: 0, elemsLength: 1, attributes: { title: 'Missing' } }],
      ],
    ]);
    expect(nonSvgResult.elementsById.size).toBe(0);
  });
});
