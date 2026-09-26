import { ConfigRules, DataFrameMap, RulesByElementId } from 'components/domain/models';
import { evaluatePanel } from 'components/domain/services/evaluator';
import { buildPanelPresentation } from './panelPresentation';
import { initializeConfig } from 'components/infrastructure/config/configSetup';
import { parseYamlConfig } from 'components/infrastructure/config/parsers';
import { initSVG } from 'components/infrastructure/svg/updater';

function run(values: Record<string, string[]>, tooltip = true) {
  const root = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  root.id = 'cell-a';
  const shape = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  shape.setAttribute('fill', 'blue');
  root.append(shape);
  const attributes: ConfigRules['attributes'] = {
    tooltip: { show: tooltip, textAbove: 'Описание' },
    metrics: [
      { queries: [{ refid: 'A' }, { refid: 'B' }], baseColor: 'green', thresholds: [{ value: 80, color: 'red' }] },
    ],
  };
  const rules: RulesByElementId = new Map([['cell-a', [{ attributes, elemIndex: 0, elemsLength: 1, selector: [] }]]]);
  const data: DataFrameMap = new Map(
    Object.entries(values).map(([refId, values]) => [refId, { values: new Map([[refId, { values }]]) }])
  );
  const evaluation = evaluatePanel(rules, data);
  const result = buildPanelPresentation(evaluation, new Map([['cell-a', root]]), {
    mode: 'svg',
    notifySettings: { show: false, threshold: undefined },
  });
  result.operations!.forEach((operation) => operation());
  return { result, evaluation, shape };
}

it.each([
  ['20', 'green'],
  ['95', 'red'],
])('[D07,D08] сохраняет %s и цвет доступных данных %s', (value, color) => {
  const { result, evaluation, shape } = run({ A: [value] });
  expect(shape.getAttribute('fill')).toBe(color);
  expect(evaluation.diagnostics).toEqual([expect.objectContaining({ code: 'MISSING_INPUT', elementIds: ['cell-a'] })]);
  expect(result.tooltipContent?.[0].diagnostics).toHaveLength(1);
  expect(result.tooltipContent?.[0].queryData?.[0].metric).toBe(value);
});

it('[D09,U01,U03] при полном отсутствии результатов создаёт серый индикатор и tooltip', () => {
  const { result, evaluation, shape } = run({});
  expect(evaluation.elements[0].winner).toBeUndefined();
  expect(shape.getAttribute('fill')).toBe('#8e8e8e');
  expect(result.tooltipContent?.[0]).toMatchObject({ id: 'cell-a', textAbove: 'Описание', noData: true });
  expect(result.tooltipContent?.[0].diagnostics).toHaveLength(2);
});

it('[U02] не включает явно отключённый tooltip', () => {
  const { result, shape } = run({}, false);
  expect(shape.getAttribute('fill')).toBe('#8e8e8e');
  expect(result.tooltipContent).toHaveLength(0);
});

it('[D10] статичный элемент не становится серым', () => {
  const attributes = { title: 'Static' };
  const rules: RulesByElementId = new Map([['cell-a', [{ attributes, elemIndex: 0, elemsLength: 1, selector: [] }]]]);
  const evaluation = evaluatePanel(rules, new Map());
  expect(evaluation.elements[0].noData).toBeUndefined();
});

it('[L07] равенство между правилами не сравнивает разные числовые значения', () => {
  const rules: RulesByElementId = new Map([
    [
      'cell-a',
      ['A', 'B'].map((refId) => ({
        attributes: { metrics: [{ queries: [{ refid: refId }], thresholds: [{ value: 0, color: refId, lvl: 1 }] }] },
        elemIndex: 0,
        elemsLength: 1,
        selector: [],
      })),
    ],
  ]);
  const data: DataFrameMap = new Map([
    ['A', { values: new Map([['a', { values: ['1'] }]]) }],
    ['B', { values: new Map([['b', { values: ['100'] }]]) }],
  ]);
  expect(evaluatePanel(rules, data).elements[0].winner?.color).toBe('A');
});

it('[U11] таблица или сообщение перед числовым правилом не скрывает его из tooltip', () => {
  const data: DataFrameMap = new Map([
    ['A', { type: 'table', length: 1, values: new Map([['name', { values: ['Synthetic'] }]]) }],
    ['B', { values: new Map([['value', { values: ['7'] }]]) }],
  ]);
  for (const first of ['A', 'missing']) {
    const rules = initializeConfig(
      null,
      parseYamlConfig(
        `changes:\n  - id: a\n    attributes:\n      tooltip: {show: true}\n      metrics:\n        queries: [{refid: ${first}}]\n  - id: a\n    attributes:\n      tooltip: {show: true}\n      metrics:\n        queries: [{refid: B}]`
      )
    );
    const result = buildPanelPresentation(evaluatePanel(rules.rulesByElementId, data), new Map(), {
      mode: 'svg',
      notifySettings: { show: false, threshold: undefined },
    });
    expect(result.tooltipContent?.[0].queryData?.[0].metric).toBe('7');
  }
});

it('[C02,C03] обе формы metrics сохраняют query > metric > default, включая 0 и []', () => {
  for (const metrics of [
    {
      decimal: 5,
      baseColor: 'green',
      thresholds: [{ value: 0, color: 'red' }],
      queries: [{ refid: 'A', decimal: 0, thresholds: [] }],
    },
    [
      {
        decimal: 5,
        baseColor: 'green',
        thresholds: [{ value: 0, color: 'red' }],
        queries: [{ refid: 'A', decimal: 0, thresholds: [] }],
      },
    ],
  ]) {
    const config = parseYamlConfig(JSON.stringify({ changes: [{ id: 'a', attributes: { metrics } }] }));
    const prepared = initializeConfig(null, config);
    const result = evaluatePanel(
      prepared.rulesByElementId,
      new Map([['A', { values: new Map([['value', { values: ['5.123'] }]]) }]])
    );
    expect(result.elements[0].winner).toMatchObject({
      metricValue: 5.123,
      displayValue: '5',
      color: 'green',
      lvl: 0,
      filling: 'fill',
    });
  }
});

it('[C23,U02,U06] схемы сохраняют оформление и отключение tooltip', () => {
  const prepared = initializeConfig(
    null,
    parseYamlConfig(
      `changes:\n  - id: ['a:table', 'b:stroke', 'c:strokeBase', 'd:text', 'e:basic']\n    attributes:\n      tooltip: {show: true}\n      metrics:\n        queries: [{refid: A}]\n        baseColor: green`
    )
  );
  const evaluation = evaluatePanel(
    prepared.rulesByElementId,
    new Map([['A', { values: new Map([['value', { values: ['7'] }]]) }]])
  );
  const result = buildPanelPresentation(evaluation, new Map(), {
    mode: 'svg',
    notifySettings: { show: false, threshold: undefined },
  });
  expect(evaluation.elements.map((element) => [element.winner?.filling, element.winner?.color])).toEqual([
    ['fill, 20', 'green'],
    ['stroke', ''],
    ['stroke', 'green'],
    ['none', 'green'],
    ['fill', 'green'],
  ]);
  expect(result.tooltipContent?.map((item) => item.id)).toEqual(['cell-e']);
});

it('[C24] кривой filter одного запроса не отменяет соседнюю исправную метрику', () => {
  const prepared = initializeConfig(
    null,
    parseYamlConfig(
      `changes:\n  - id: a\n    attributes:\n      metrics:\n        queries:\n          - {refid: A, filter: {include: {name: broken}}}\n          - {refid: B}`
    )
  );
  const data: DataFrameMap = new Map(
    ['A', 'B'].map((refId) => [refId, { values: new Map([['value', { values: ['7'] }]]) }])
  );
  const result = evaluatePanel(prepared.rulesByElementId, data);
  expect(result.elements[0].winner?.metricValue).toBe(7);
  expect(result.diagnostics?.some((item) => item.code === 'INVALID_FILTER')).toBe(true);
});

it('[C26] нестроковый filling диагностируется до выполнения DOM-операций', () => {
  const svg = initSVG(
    '<svg xmlns="http://www.w3.org/2000/svg"><g id="cell-a"><rect fill="blue"/></g><g id="cell-b"><rect fill="blue"/></g></svg>',
    'disable'
  )!;
  const prepared = initializeConfig(
    svg,
    parseYamlConfig(
      `changes:\n  - id: a\n    attributes:\n      metrics:\n        queries: [{refid: A, filling: 20}]\n        baseColor: red\n  - id: b\n    attributes:\n      metrics:\n        queries: [{refid: A}]\n        baseColor: green`
    )
  );
  const evaluation = evaluatePanel(
    prepared.rulesByElementId,
    new Map([['A', { values: new Map([['value', { values: ['7'] }]]) }]])
  );
  const result = buildPanelPresentation(evaluation, prepared.elementsById, {
    mode: 'svg',
    notifySettings: { show: false, threshold: undefined },
  });
  expect(() => result.operations!.forEach((operation) => operation())).not.toThrow();
  expect(evaluation.diagnostics?.[0].code).toBe('INVALID_FILLING');
  expect(svg.querySelector('#cell-b rect')?.getAttribute('fill')).toBe('green');
});

it('[C25] selectors оставляют причины только у нужных элементов', () => {
  const svg = new DOMParser().parseFromString(
    '<svg xmlns="http://www.w3.org/2000/svg"><g id="cell-a"/><g id="cell-b"/></svg>',
    'image/svg+xml'
  );
  const prepared = initializeConfig(
    svg,
    parseYamlConfig(
      `changes:\n  - id: ['a:@1', 'b:@2']\n    attributes:\n      tooltip: {show: true}\n      metrics:\n        queries: [{refid: missing}, {refid: B}]`
    )
  );
  const evaluation = evaluatePanel(
    prepared.rulesByElementId,
    new Map([['B', { values: new Map([['value', { values: ['7'] }]]) }]])
  );
  expect(evaluation.elements[0].noData).toBeDefined();
  expect(evaluation.elements[1].winner?.metricValue).toBe(7);
  expect(evaluation.diagnostics).toEqual([expect.objectContaining({ elementIds: ['cell-a'] })]);
});

it('[C09] общая ошибка правила содержит source и все известные элементы', () => {
  const parsed = parseYamlConfig(
    `changes:\n  - id: ['a', 'b']\n    attributes:\n      metrics:\n        queries: [{refid: missing}]`
  )!;
  const prepared = initializeConfig(null, parsed);
  const evaluation = evaluatePanel(prepared.rulesByElementId, new Map());
  expect(evaluation.diagnostics).toEqual([
    expect.objectContaining({
      elementIds: ['cell-a', 'cell-b'],
      source: expect.objectContaining({ path: 'changes[0]', refId: 'missing' }),
    }),
  ]);
});

it('[U06] лишний элемент autoConfig сохраняет stroke при no-data', () => {
  const svg = initSVG(
    '<svg xmlns="http://www.w3.org/2000/svg"><g id="cell-a"><rect fill="blue"/></g><g id="cell-b"><rect fill="blue"/></g></svg>',
    'disable'
  )!;
  const prepared = initializeConfig(
    svg,
    parseYamlConfig(
      `changes:\n  - id: ['a:stroke', 'b:stroke']\n    attributes:\n      autoConfig: true\n      metrics:\n        queries: [{refid: A}]`
    )
  );
  const evaluation = evaluatePanel(
    prepared.rulesByElementId,
    new Map([['A', { values: new Map([['value', { values: ['7'] }]]) }]])
  );
  const result = buildPanelPresentation(evaluation, prepared.elementsById, {
    mode: 'svg',
    notifySettings: { show: false, threshold: undefined },
  });
  result.operations!.forEach((operation) => operation());
  expect(svg.querySelector('#cell-b rect')?.getAttribute('fill')).toBe('blue');
  expect(svg.querySelector('#cell-b rect')?.getAttribute('stroke')).toBe('#8e8e8e');
});

it('[D16,B10] таблица для чтения не скрывает отсутствие числового индикатора', () => {
  const prepared = initializeConfig(
    null,
    parseYamlConfig(
      `changes:\n  - id: a\n    attributes:\n      tooltip: {show: true}\n      metrics:\n        - queries: [{refid: A}]\n          baseColor: green\n        - queries: [{refid: B}]\n          filling: none`
    )
  );
  const evaluation = evaluatePanel(
    prepared.rulesByElementId,
    new Map([['B', { type: 'table', length: 1, values: new Map([['name', { values: ['Synthetic'] }]]) }]])
  );
  expect(evaluation.elements[0].winner).toBeUndefined();
  expect(evaluation.elements[0].noData).toBeDefined();
  const result = buildPanelPresentation(evaluation, new Map(), {
    mode: 'svg',
    notifySettings: { show: false, threshold: undefined },
  });
  expect(result.tooltipContent?.[0].queryTableData?.[0].columnsData[0].row).toEqual(['Synthetic']);
  expect(result.tooltipContent?.[0].noData).toBe(true);
  const rules = prepared.rulesByElementId.get('cell-a')![0];
  rules.attributes.metrics!.reverse();
  rules.attributes.metrics![1].queries![0].filling = 'stroke';
  const reversed = evaluatePanel(
    prepared.rulesByElementId,
    new Map([['B', { type: 'table', length: 1, values: new Map([['name', { values: ['Synthetic'] }]]) }]])
  );
  expect(reversed.elements[0].noData?.filling).toBe('stroke');
});

it('[U12] очистка неактивного вложенного id не отменяет текущую окраску группы', () => {
  const svg = initSVG(
    '<svg xmlns="http://www.w3.org/2000/svg"><g id="cell-parent"><g id="cell-child"><rect fill="blue"/></g></g></svg>',
    'disable'
  )!;
  const data: DataFrameMap = new Map([['A', { values: new Map([['value', { values: ['1'] }]]) }]]);
  const update = (id: string, color: string) => {
    const prepared = initializeConfig(svg, [
      { id, attributes: { metrics: [{ queries: [{ refid: 'A' }], baseColor: color }] } },
    ]);
    const result = buildPanelPresentation(evaluatePanel(prepared.rulesByElementId, data), prepared.elementsById, {
      mode: 'svg',
      notifySettings: { show: false, threshold: undefined },
    });
    result.operations!.forEach((operation) => operation());
  };
  update('parent', 'red');
  expect(svg.querySelector('rect')?.getAttribute('fill')).toBe('red');
  update('child', 'green');
  expect(svg.querySelector('rect')?.getAttribute('fill')).toBe('green');
  update('parent', 'orange');
  expect(svg.querySelector('rect')?.getAttribute('fill')).toBe('orange');
});

it('[U13] static-правило не возвращает зелёный цвет динамического текста при no-data', () => {
  const svg = initSVG(
    '<svg xmlns="http://www.w3.org/2000/svg"><g id="cell-a"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml" style="color: green">Caption</div></foreignObject></g></svg>',
    'disable'
  )!;
  const label = svg.querySelector('div') as HTMLElement;
  const prepared = initializeConfig(
    svg,
    parseYamlConfig(`changes:
  - id: a
    attributes: {title: Static}
  - id: a
    attributes:
      label: replace
      labelColor: metric
      metrics:
        queries: [{refid: A}]
        filling: none
        thresholds: [{value: 80, color: red}]
`)
  );
  const update = (data: DataFrameMap) => {
    const result = buildPanelPresentation(evaluatePanel(prepared.rulesByElementId, data), prepared.elementsById, {
      mode: 'svg',
      notifySettings: { show: false, threshold: undefined },
    });
    result.operations!.forEach((operation) => operation());
  };
  update(new Map([['A', { values: new Map([['value', { values: ['95'] }]]) }]]));
  expect(label.textContent).toBe('95');
  expect(label.style.color).toBe('red');
  update(new Map());
  expect(label.textContent).toBe('Caption');
  expect(label.style.color).toBe('rgb(142, 142, 142)');
});
