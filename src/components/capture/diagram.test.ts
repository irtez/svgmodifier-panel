import { readFileSync } from 'fs';
import { resolve } from 'path';
import { prepareDiagram, collectDiagram, attachDiagram } from './diagram';
import type { SvgModifierSnapshotV1 } from './models';
import { validateSnapshot } from './testing/validateSnapshot';
import { href, scanElements, paint } from './diagramDom';

const sourceSvg = readFileSync(resolve(__dirname, '../../../tests/capture/diagram.svg'), 'utf8');
const snapshot = (): SvgModifierSnapshotV1 =>
  JSON.parse(readFileSync(resolve(__dirname, '../../../docs/examples/capture-v1.json'), 'utf8'));

it('[V01] grid сохраняет исходный рисунок без выдуманного layout и live-текста', async () => {
  const value = snapshot();
  const source = await prepareDiagram(sourceSvg);
  const capture = collectDiagram({ source, root: null, mode: 'grid', rules: value.configuration.rules });
  expect(capture.diagram.status).toBe('not_rendered');
  expect(capture.diagram.items.find((item) => item.svgId === 'heading')?.authoredText).toBe('External inputs');
  expect(
    capture.diagram.items.every((item) => item.bounds === null && !item.paints.length && !item.textFragments.length)
  ).toBe(true);
  const result = attachDiagram(value, capture);
  expect(validateSnapshot(result, { panelId: 7, maxPayloadBytes: 1024 * 1024 })).toEqual([]);
  expect(result.elements[0].diagramItemId).not.toBeNull();
  expect(result.elements[0].label).toBeNull();
});

it.each([
  ['', 'missing'],
  ['<svg>', 'invalid'],
  ['<html/>', 'invalid'],
])('[V02] отсутствующий или неверный SVG имеет явный status (%s)', async (text, status) => {
  const source = await prepareDiagram(text);
  const capture = collectDiagram({ source, root: null, mode: 'svg', rules: [] });
  expect(capture.diagram.status).toBe(status);
  if (status === 'invalid') {
    expect(capture.diagnostics.length).toBeGreaterThan(0);
  }
});

it('[V03] defs/use/image не превращаются в выдуманный текст или бизнес-связь', async () => {
  const capture = collectDiagram({ source: await prepareDiagram(sourceSvg), root: null, mode: 'grid', rules: [] });
  expect(capture.diagram.items.find((item) => item.svgId === 'resource-icon')).toBeUndefined();
  expect(capture.diagram.items.find((item) => item.svgId === 'icon-instance')?.tag).toBe('use');
  expect(capture.diagram.items.find((item) => item.svgId === 'image-heading')?.authoredText).toBeNull();
  expect(capture.diagram.connections).toEqual([]);
});

it('[V04] ссылки каждого правила и автора сохраняются без переходов', async () => {
  const value = snapshot();
  const other = {
    ...value.configuration.rules[0],
    id: 'rule-other',
    attributes: { link: '/d/other?to=now&var-node=beta' },
  };
  const capture = collectDiagram({
    source: await prepareDiagram(sourceSvg),
    root: null,
    mode: 'grid',
    rules: [...value.configuration.rules, other],
  });
  const item = capture.diagram.items.find((item) => item.svgId === 'cell-alpha')!;
  expect(item.links.applied).toBeNull();
  expect(item.links.declarations).toEqual(
    expect.arrayContaining([
      { origin: 'svg', ruleId: null, value: '/d/original?var-node=alpha&from=now-3h' },
      { origin: 'rule', ruleId: 'rule-alpha', value: '/d/example-service?var-node=alpha' },
      { origin: 'rule', ruleId: 'rule-other', value: '/d/other?to=now&var-node=beta' },
    ])
  );
});

it('[V05] повторный SVG ID не связывается с произвольно первым объектом', async () => {
  const value = snapshot();
  const source = await prepareDiagram(
    '<svg xmlns="http://www.w3.org/2000/svg"><g id="cell-alpha"/><g id="cell-alpha"/></svg>'
  );
  const capture = collectDiagram({ source, root: null, mode: 'grid', rules: value.configuration.rules });
  const result = attachDiagram(value, capture);
  expect(result.elements[0].diagramItemId).toBeNull();
  expect(result.diagnostics.some((item) => item.code === 'CAPTURE_SVG_ID_AMBIGUOUS')).toBe(true);
});

it('[V14] ссылка снаружи SVG не становится ссылкой каждого объекта', () => {
  const host = document.createElement('div');
  host.innerHTML = '<a href="/outer"><svg><g id="inside"/></svg></a>';
  expect(href(host.querySelector('g'))).toBeNull();
});

it('[V25] вложенный SVG наследует ссылку до границы экспортируемого рисунка', async () => {
  const text =
    '<svg xmlns="http://www.w3.org/2000/svg"><a href="/nested"><svg><rect id="nested" width="10" height="10"/></svg></a></svg>';
  const capture = collectDiagram({ source: await prepareDiagram(text), root: null, mode: 'grid', rules: [] });
  expect(capture.diagram.items.find((item) => item.svgId === 'nested')?.links.declarations).toEqual([
    { origin: 'svg', ruleId: null, value: '/nested' },
  ]);
});

it('[V15] лимиты числа узлов и глубины завершают capture ошибкой, а не префиксом', () => {
  const parse = (text: string) => new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
  expect(() => scanElements(parse('<svg><g/><g/></svg>'), 2)).toThrow('CAPTURE_SVG_NODE_LIMIT');
  expect(scanElements(parse('<svg><g/></svg>'), 2)).toHaveLength(2);
  expect(() => scanElements(parse('<svg>' + '<g>'.repeat(260) + '</g>'.repeat(260) + '</svg>'))).toThrow(
    'CAPTURE_SVG_DEPTH_LIMIT'
  );
});

it('[V16] ошибка metadata прикреплена к рисунку, повторная сборка не оставляет старые ошибки', async () => {
  const value = snapshot();
  const bad = await prepareDiagram(sourceSvg.replace('<svg ', '<svg content="not XML" '));
  const first = attachDiagram(
    value,
    collectDiagram({ source: bad, root: null, mode: 'grid', rules: value.configuration.rules })
  );
  expect(first.diagnostics.some((diagnostic) => diagnostic.code === 'DIAGRAM_METADATA_INVALID')).toBe(true);
  const second = attachDiagram(
    first,
    collectDiagram({
      source: await prepareDiagram(sourceSvg),
      root: null,
      mode: 'grid',
      rules: value.configuration.rules,
    })
  );
  expect(second.diagnostics.some((diagnostic) => diagnostic.code === 'DIAGRAM_METADATA_INVALID')).toBe(false);
  expect(validateSnapshot(second, { panelId: 7, maxPayloadBytes: 1024 * 1024 })).toEqual([]);
  expect(value).toEqual(snapshot());
});

it('[V17] неоднозначный data-cell-id не подтверждает конец связи', async () => {
  const model =
    '<mxGraphModel><root><mxCell id="a" vertex="1"/><mxCell id="e" edge="1" source="a"/></root></mxGraphModel>';
  const text =
    '<svg xmlns="http://www.w3.org/2000/svg" content="' +
    model.replace(/</g, '&lt;').replace(/"/g, '&quot;') +
    '"><g data-cell-id="a"/><g data-cell-id="a"/><path id="cell-alpha" data-cell-id="e"/></svg>';
  const value = snapshot();
  const result = attachDiagram(
    value,
    collectDiagram({ source: await prepareDiagram(text), root: null, mode: 'grid', rules: value.configuration.rules })
  );
  expect(result.diagram.connections[0].source).toEqual({ cellId: 'a', svgId: null, itemId: null });
  const issue = result.diagnostics.find((diagnostic) => diagnostic.code === 'CAPTURE_METADATA_SOURCE_UNRESOLVED')!;
  expect(result.elements[0].diagnosticIds).toContain(issue.id);
  expect(validateSnapshot(result, { panelId: 7, maxPayloadBytes: 1024 * 1024 })).toEqual([]);
});

it('[V18] source size и внутренние XML-сущности не обходят ограничения', async () => {
  await expect(prepareDiagram(' '.repeat(8 * 1024 * 1024) + '<svg/>')).rejects.toThrow('CAPTURE_SVG_SOURCE_LIMIT');
  const source = await prepareDiagram(
    '<!DOCTYPE svg [<!ENTITY label "secret">]><svg xmlns="http://www.w3.org/2000/svg"><text>&label;</text></svg>'
  );
  expect(source.status).toBe('invalid');
  expect(source.root).toBeNull();
});

it.each([
  ['rgb(1, 2, 3)', [1, 2, 3, 1]],
  ['rgba(1, 2, 3, 0.5)', [1, 2, 3, 0.5]],
  ['rgb(100% 0% 0% / 50%)', [255, 0, 0, 0.5]],
  ['none', null],
  ['url(#gradient)', null],
  ['color(display-p3 1 0 0)', null],
])('[V19] CSS paint сохраняет исходное значение %s', (css, rgba) => {
  expect(paint(css as string)).toEqual({ css, rgba });
});

it('[V24] общий бюджет authoredText ограничивает повторение длинной подписи у предков', async () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg">' +
    '<g>'.repeat(10) +
    '<text>' +
    'Label '.repeat(25000) +
    '</text>' +
    '</g>'.repeat(10) +
    '</svg>';
  const source = await prepareDiagram(svg);
  expect(() => collectDiagram({ source, root: null, mode: 'grid', rules: [] })).toThrow('CAPTURE_SVG_TEXT_LIMIT');
});
