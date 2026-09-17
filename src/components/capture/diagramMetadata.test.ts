import {
  DecompressionStream as NativeDecompressionStream,
  ReadableStream as NativeReadableStream,
} from 'node:stream/web';
import { TextDecoder as NativeTextDecoder } from 'node:util';
import { deflateRawSync } from 'node:zlib';
import { readDiagramMetadata } from './diagramMetadata';

const model = (cells: string) => `<mxGraphModel><root>${cells}</root></mxGraphModel>`;
const escapeXml = (xml: string) => xml.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

describe('readDiagramMetadata', () => {
  it.each([null, '', ' \n\t '])('[M01] не считает отсутствие метаданных ошибкой: %p', async (input) => {
    expect(await readDiagramMetadata(input)).toEqual({ status: 'missing', cells: [], issues: [] });
  });

  it('[M02] возвращает только точные идентификаторы, типы и явные связи', async () => {
    const result = await readDiagramMetadata(
      model(`
      <mxCell id="0"/>
      <mxCell id="1" parent="0"/>
      <mxCell id=" Alpha &amp; β " parent="1" vertex="1" value="Synthetic label" style="fillColor=red"/>
      <mxCell id="edge-1" parent="1" edge="1" source=" Alpha &amp; β " target="other"
        style="edgeStyle=orthogonalEdgeStyle;startArrow=oval;endArrow=block;"/>
    `)
    );
    expect(result).toEqual({
      status: 'ready',
      cells: [
        { id: '0', kind: 'cell', parentId: null, source: null, target: null, startArrow: null, endArrow: null },
        { id: '1', kind: 'cell', parentId: '0', source: null, target: null, startArrow: null, endArrow: null },
        {
          id: ' Alpha & β ',
          kind: 'vertex',
          parentId: '1',
          source: null,
          target: null,
          startArrow: null,
          endArrow: null,
        },
        {
          id: 'edge-1',
          kind: 'edge',
          parentId: '1',
          source: ' Alpha & β ',
          target: 'other',
          startArrow: 'oval',
          endArrow: 'block',
        },
      ],
      issues: [],
    });
    expect(JSON.stringify(result)).not.toMatch(/Synthetic label|fillColor|edgeStyle/);
  });

  it('[M03] берёт ID object/UserObject только при отсутствии собственного ID mxCell', async () => {
    const result = await readDiagramMetadata(
      model(`
      <object id="wrapped" label="Public object" arbitrary="not exported"><mxCell vertex="1" parent="group"/></object>
      <UserObject id="wrapped-edge" label="Public edge"><mxCell edge="1" source="wrapped" target="own"/></UserObject>
      <UserObject id="ignored"><mxCell id="own" vertex="1"/></UserObject>
    `)
    );
    expect(result.status).toBe('ready');
    expect(result.cells.map(({ id }) => id)).toEqual(['wrapped', 'wrapped-edge', 'own']);
    expect(result.cells[1]).toMatchObject({
      kind: 'edge',
      source: 'wrapped',
      target: 'own',
      startArrow: null,
      endArrow: null,
    });
    expect(JSON.stringify(result)).not.toMatch(/Public|arbitrary|ignored/);
  });

  it.each([
    `<mxfile><diagram>${model('<mxCell id="plain" vertex="1"/>')}</diagram></mxfile>`,
    `<mxfile><diagram>${escapeXml(model('<mxCell id="plain" vertex="1"/>'))}</diagram></mxfile>`,
    `<mxfile><diagram><![CDATA[${model('<mxCell id="plain" vertex="1"/>')}]]></diagram></mxfile>`,
  ])('[M04] читает единственную несжатую диаграмму', async (input) => {
    const result = await readDiagramMetadata(input);
    expect(result.status).toBe('ready');
    expect(result.cells).toEqual([
      { id: 'plain', kind: 'vertex', parentId: null, source: null, target: null, startArrow: null, endArrow: null },
    ]);
  });

  it('[M05] сохраняет явный none и последнее значение стрелки без вывода style', async () => {
    const result = await readDiagramMetadata(
      model('<mxCell id="edge" edge="1" style="endArrow=block;startArrow=none;endArrow=open;"/>')
    );
    expect(result.cells[0]).toMatchObject({ startArrow: 'none', endArrow: 'open' });
  });

  it.each([
    ['повреждённый XML', '<mxGraphModel><root>'],
    ['чужой root', '<svg><mxCell id="alpha"/></svg>'],
    ['нет root', '<mxGraphModel/>'],
    ['два root', '<mxGraphModel><root/><root/></mxGraphModel>'],
    ['нет ID', model('<mxCell vertex="1"/>')],
    ['пустой собственный ID', model('<object id="wrapper"><mxCell id="" vertex="1"/></object>')],
    ['повтор ID', model('<mxCell id="alpha"/><mxCell id="alpha"/>')],
    ['повтор wrapper ID', model('<mxCell id="alpha"/><object id="alpha"><mxCell vertex="1"/></object>')],
    ['вложенная cell', model('<mxCell id="alpha"><mxCell id="beta"/></mxCell>')],
    ['одновременно vertex и edge', model('<mxCell id="alpha" vertex="1" edge="1"/>')],
    ['пустая diagram', '<mxfile><diagram/></mxfile>'],
    ['нет diagram', '<mxfile/>'],
  ])('[M06] не возвращает частичные факты: %s', async (_, input) => {
    const result = await readDiagramMetadata(input);
    expect(result.status).toBe('invalid');
    expect(result.cells).toEqual([]);
    expect(result.issues).toEqual([expect.objectContaining({ code: expect.any(String), message: expect.any(String) })]);
    expect(JSON.stringify(result.issues)).not.toMatch(/alpha|beta|wrapper|<mx/);
  });

  it.each([
    `<mxfile><diagram>${model('<mxCell id="alpha"/>')}</diagram><diagram>${model(
      '<mxCell id="beta"/>'
    )}</diagram></mxfile>`,
    `<mxfile><diagram>${model('<mxCell id="alpha"/>')}${model('<mxCell id="beta"/>')}</diagram></mxfile>`,
    model(`<mxCell id="alpha"/>${model('<mxCell id="beta"/>')}`),
    `<mxfile><diagram>${model('<mxCell id="alpha"/>')}${escapeXml(model('<mxCell id="beta"/>'))}</diagram></mxfile>`,
  ])('[M07] явно отклоняет неоднозначный выбор нескольких diagram/model', async (input) => {
    const result = await readDiagramMetadata(input);
    expect(result.status).toBe('unsupported');
    expect(result.cells).toEqual([]);
    expect(result.issues).toHaveLength(1);
  });

  it.each([
    '<!DOCTYPE mxGraphModel [<!ENTITY label "Synthetic">]><mxGraphModel><root><mxCell id="&label;"/></root></mxGraphModel>',
    '<!DOCTYPE mxGraphModel SYSTEM "https://example.invalid/private.dtd"><mxGraphModel><root/></mxGraphModel>',
    '<!ENTITY external SYSTEM "file:///synthetic">' + model(''),
  ])('[M08] отклоняет DOCTYPE/ENTITY до XML-парсера', async (input) => {
    const parse = jest.spyOn(DOMParser.prototype, 'parseFromString');
    try {
      const result = await readDiagramMetadata(input);
      expect(result.status).toBe('invalid');
      expect(result.cells).toEqual([]);
      expect(parse).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).not.toMatch(/Synthetic|private.dtd|file:\/\//);
    } finally {
      parse.mockRestore();
    }
  });

  it('[M09] проверяет DOCTYPE после XML entity decoding содержимого diagram', async () => {
    const input = `<mxfile><diagram>${escapeXml('<!DOCTYPE mxGraphModel>' + model(''))}</diagram></mxfile>`;
    expect((await readDiagramMetadata(input)).status).toBe('invalid');
  });

  it.each(['maxEncodedBytes', 'maxDecodedBytes'] as const)(
    '[M10] проверяет %s до XML-парсера по UTF-8 байтам',
    async (limit) => {
      const input = model('<mxCell id="β😀"/>');
      const bytes = Buffer.byteLength(input, 'utf8');
      const parse = jest.spyOn(DOMParser.prototype, 'parseFromString');
      try {
        const result = await readDiagramMetadata(input, { [limit]: bytes - 1 });
        expect(result.status).toBe('limited');
        expect(result.cells).toEqual([]);
        expect(parse).not.toHaveBeenCalled();
        expect((await readDiagramMetadata(input, { [limit]: bytes })).status).toBe('ready');
      } finally {
        parse.mockRestore();
      }
    }
  );

  it('[M11] лимит cells учитывает wrapper и не возвращает допустимый префикс', async () => {
    const input = model('<mxCell id="alpha"/><object id="beta"><mxCell vertex="1"/></object>');
    expect(await readDiagramMetadata(input, { maxCells: 1 })).toMatchObject({ status: 'limited', cells: [] });
    expect((await readDiagramMetadata(input, { maxCells: 2 })).cells).toHaveLength(2);
    expect((await readDiagramMetadata(model(''), { maxCells: 0 })).status).toBe('ready');
  });

  it.each([-1, NaN, Infinity, 1.5])('[M12] не позволяет отключить бюджет некорректным лимитом %p', async (maxCells) => {
    expect(await readDiagramMetadata(model('<mxCell id="alpha"/>'), { maxCells })).toMatchObject({
      status: 'invalid',
      cells: [],
    });
  });
});

describe('сжатые draw.io metadata', () => {
  const nativeGlobals = {
    DecompressionStream: NativeDecompressionStream,
    ReadableStream: NativeReadableStream,
    TextDecoder: NativeTextDecoder,
  };
  const originalGlobals = new Map(
    Object.keys(nativeGlobals).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)])
  );
  const compressed = (xml: string) =>
    `<mxfile><diagram>${deflateRawSync(encodeURIComponent(xml)).toString('base64')}</diagram></mxfile>`;

  beforeEach(() => {
    for (const [name, value] of Object.entries(nativeGlobals)) {
      Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
    }
  });
  afterEach(() => {
    for (const [name, descriptor] of originalGlobals) {
      if (descriptor) {
        Object.defineProperty(globalThis, name, descriptor);
      } else {
        Reflect.deleteProperty(globalThis, name);
      }
    }
  });

  it('[M13] распаковывает реальный raw DEFLATE и декодирует URL-encoded XML', async () => {
    const result = await readDiagramMetadata(
      compressed(
        model(`
      <mxCell id="Service α 😀" vertex="1"/>
      <mxCell id="edge" edge="1" source="Service α 😀" target="Other" style="endArrow=classic;"/>
    `)
      )
    );
    expect(result).toEqual({
      status: 'ready',
      cells: [
        {
          id: 'Service α 😀',
          kind: 'vertex',
          parentId: null,
          source: null,
          target: null,
          startArrow: null,
          endArrow: null,
        },
        {
          id: 'edge',
          kind: 'edge',
          parentId: null,
          source: 'Service α 😀',
          target: 'Other',
          startArrow: null,
          endArrow: 'classic',
        },
      ],
      issues: [],
    });
  });

  it('[M14] возвращает unsupported при отсутствии нативного декодера', async () => {
    Object.defineProperty(globalThis, 'DecompressionStream', { value: undefined, configurable: true });
    const result = await readDiagramMetadata(compressed(model('<mxCell id="public"/>')));
    expect(result).toMatchObject({ status: 'unsupported', cells: [] });
    expect(result.issues).toHaveLength(1);
  });

  it.each([
    ['base64', 'not valid base64!'],
    ['DEFLATE', Buffer.from([0, 1, 2]).toString('base64')],
    ['URL encoding', deflateRawSync('%ZZ').toString('base64')],
    ['UTF-8', deflateRawSync(Buffer.from([255, 254])).toString('base64')],
  ])('[M15] отклоняет повреждённый %s без исходного payload в ошибке', async (_, payload) => {
    const result = await readDiagramMetadata(`<mxfile><diagram>${payload}</diagram></mxfile>`);
    expect(result).toMatchObject({ status: 'invalid', cells: [] });
    expect(result.issues).toHaveLength(1);
    expect(JSON.stringify(result.issues)).not.toContain(payload);
  });

  it('[M16] останавливает распаковку до XML DOM при превышении лимита потока', async () => {
    const input = compressed(model(`<mxCell id="public" value="${'x'.repeat(100_000)}"/>`));
    const parse = jest.spyOn(DOMParser.prototype, 'parseFromString');
    try {
      const result = await readDiagramMetadata(input, { maxDecodedBytes: 1024 });
      expect(result).toMatchObject({ status: 'limited', cells: [] });
      expect(parse).toHaveBeenCalledTimes(1);
    } finally {
      parse.mockRestore();
    }
  });

  it('[M17] принимает точную границу потока и отклоняет один лишний байт', async () => {
    const xml = model(`<mxCell id="public" value="${'x'.repeat(400)}"/>`);
    const limit = Buffer.byteLength(encodeURIComponent(xml));
    expect((await readDiagramMetadata(compressed(xml), { maxDecodedBytes: limit })).status).toBe('ready');
    expect(await readDiagramMetadata(compressed(xml), { maxDecodedBytes: limit - 1 })).toMatchObject({
      status: 'limited',
      cells: [],
    });
  });

  it('[M18] отклоняет DTD после распаковки до второго вызова XML-парсера', async () => {
    const input = compressed('<!DOCTYPE mxGraphModel [<!ENTITY label "Synthetic">]>' + model('<mxCell id="&label;"/>'));
    const parse = jest.spyOn(DOMParser.prototype, 'parseFromString');
    try {
      expect(await readDiagramMetadata(input)).toMatchObject({ status: 'invalid', cells: [] });
      expect(parse).toHaveBeenCalledTimes(1);
    } finally {
      parse.mockRestore();
    }
  });

  it('[M19] применяет лимит cells после распаковки без частичного результата', async () => {
    const input = compressed(model('<mxCell id="alpha"/><mxCell id="beta"/>'));
    expect(await readDiagramMetadata(input, { maxCells: 1 })).toMatchObject({ status: 'limited', cells: [] });
  });
});
