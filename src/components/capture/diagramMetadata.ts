export interface DiagramCell {
  id: string;
  kind: 'vertex' | 'edge' | 'cell';
  parentId: string | null;
  source: string | null;
  target: string | null;
  startArrow: string | null;
  endArrow: string | null;
}

export interface DiagramMetadata {
  status: 'missing' | 'ready' | 'invalid' | 'limited' | 'unsupported';
  cells: DiagramCell[];
  issues: Array<{ code: string; message: string }>;
}

type MetadataLimits = { maxEncodedBytes?: number; maxDecodedBytes?: number; maxCells?: number };
type FailureStatus = 'invalid' | 'limited' | 'unsupported';

class MetadataError extends Error {
  constructor(readonly status: FailureStatus, readonly code: string, message: string) {
    super(message);
  }
}

function invalid(): never {
  throw new MetadataError('invalid', 'DIAGRAM_METADATA_INVALID', 'Некорректные метаданные диаграммы.');
}

function ambiguous(): never {
  throw new MetadataError(
    'unsupported',
    'DIAGRAM_METADATA_AMBIGUOUS',
    'Несколько диаграмм или моделей: выбор неоднозначен.'
  );
}

function limited(): never {
  throw new MetadataError('limited', 'DIAGRAM_METADATA_LIMIT', 'Превышен лимит метаданных диаграммы.');
}

/** Считает UTF-8 без создания дополнительной копии всего входа. */
function checkBytes(value: string, maximum: number): void {
  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x80) {
      bytes++;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      value.charCodeAt(i + 1) >= 0xdc00 &&
      value.charCodeAt(i + 1) <= 0xdfff
    ) {
      bytes += 4;
      i++;
    } else {
      bytes += 3;
    }
    if (bytes > maximum) {
      limited();
    }
  }
}

function parseXml(xml: string, maximum: number): Element {
  checkBytes(xml, maximum);
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) {
    throw new MetadataError('invalid', 'DIAGRAM_METADATA_DECLARATION', 'DTD и сущности в метаданных запрещены.');
  }
  // Отдельный XML-документ никогда не вставляется в отображаемый DOM.
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.getElementsByTagName('parsererror').length || !document.documentElement) {
    invalid();
  }
  if (document.getElementsByTagName('mxGraphModel').length > 1) {
    ambiguous();
  }
  return document.documentElement;
}

function readCells(model: Element, maximum: number): DiagramCell[] {
  if (model.tagName !== 'mxGraphModel' || model.namespaceURI) {
    invalid();
  }
  const roots = model.getElementsByTagName('root');
  if (roots.length !== 1 || roots[0].parentElement !== model) {
    invalid();
  }
  const root = roots[0];
  const elements = model.getElementsByTagName('mxCell');
  if (elements.length > maximum) {
    limited();
  }
  const cells: DiagramCell[] = [];
  const ids = new Set<string>();
  for (const cell of elements) {
    const parent = cell.parentElement;
    const wrapper =
      parent?.parentElement === root && (parent.tagName === 'object' || parent.tagName === 'UserObject')
        ? parent
        : null;
    if (
      cell.namespaceURI ||
      (parent !== root && !wrapper) ||
      (wrapper && wrapper.getElementsByTagName('mxCell').length !== 1)
    ) {
      invalid();
    }
    const id = cell.getAttribute('id') ?? wrapper?.getAttribute('id');
    if (!id || ids.has(id)) {
      invalid();
    }
    ids.add(id);
    const vertex = cell.getAttribute('vertex') === '1';
    const edge = cell.getAttribute('edge') === '1';
    if (vertex && edge) {
      invalid();
    }
    let startArrow: string | null = null;
    let endArrow: string | null = null;
    // Именованные стили и defaults не дают доказательства о стрелках.
    for (const match of (cell.getAttribute('style') ?? '').matchAll(/(?:^|;)(startArrow|endArrow)=([^;]*)/g)) {
      if (match[1] === 'startArrow') {
        startArrow = match[2];
      } else {
        endArrow = match[2];
      }
    }
    cells.push({
      id,
      kind: vertex ? 'vertex' : edge ? 'edge' : 'cell',
      parentId: cell.getAttribute('parent'),
      source: cell.getAttribute('source'),
      target: cell.getAttribute('target'),
      startArrow,
      endArrow,
    });
  }
  return cells;
}

async function inflatePayload(payload: string, maximum: number): Promise<string> {
  // Base64 уже ограничен размером внешнего XML; декодер не расширяет его.
  const binary = atob(payload);
  let decompressor: DecompressionStream;
  try {
    decompressor = new DecompressionStream('deflate-raw');
  } catch {
    throw new MetadataError(
      'unsupported',
      'DIAGRAM_METADATA_COMPRESSION',
      'Нативное декодирование raw DEFLATE недоступно.'
    );
  }
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const reader = source.pipeThrough(decompressor).getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const chunks: string[] = [];
  let decodedBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      decodedBytes += value.byteLength;
      if (decodedBytes > maximum) {
        limited();
      }
      // Проверка байтов предшествует созданию строк и URL/XML decoding.
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return decodeURIComponent(chunks.join(''));
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

async function readModel(root: Element, maximum: number): Promise<Element> {
  if (root.tagName === 'mxGraphModel') {
    return root;
  }
  if (root.tagName !== 'mxfile' || root.namespaceURI) {
    invalid();
  }
  const diagrams = root.getElementsByTagName('diagram');
  if (diagrams.length > 1) {
    ambiguous();
  }
  if (diagrams.length !== 1 || diagrams[0].parentElement !== root) {
    invalid();
  }
  const diagram = diagrams[0];
  if (diagram.children.length) {
    for (const node of diagram.childNodes) {
      if ((node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) && node.textContent?.trim()) {
        ambiguous();
      }
    }
    if (diagram.children.length !== 1 || diagram.firstElementChild?.tagName !== 'mxGraphModel') {
      invalid();
    }
    return diagram.firstElementChild;
  }
  const payload = (diagram.textContent ?? '').trim();
  if (!payload) {
    invalid();
  }
  if (payload.startsWith('<')) {
    return parseXml(payload, maximum);
  }
  return parseXml(await inflatePayload(payload, maximum), maximum);
}

export async function readDiagramMetadata(
  content: string | null,
  limits: MetadataLimits = {}
): Promise<DiagramMetadata> {
  if (content === null || content === '') {
    return { status: 'missing', cells: [], issues: [] };
  }
  try {
    const maxEncodedBytes = limits.maxEncodedBytes ?? 4 * 1024 * 1024;
    const maxDecodedBytes = limits.maxDecodedBytes ?? 8 * 1024 * 1024;
    const maxCells = limits.maxCells ?? 20_000;
    if (![maxEncodedBytes, maxDecodedBytes, maxCells].every((limit) => Number.isSafeInteger(limit) && limit >= 0)) {
      invalid();
    }
    checkBytes(content, maxEncodedBytes);
    if (!content.trim()) {
      return { status: 'missing', cells: [], issues: [] };
    }
    const root = parseXml(content, maxDecodedBytes);
    const model = await readModel(root, maxDecodedBytes);
    return { status: 'ready', cells: readCells(model, maxCells), issues: [] };
  } catch (error) {
    if (error instanceof MetadataError) {
      return { status: error.status, cells: [], issues: [{ code: error.code, message: error.message }] };
    }
    return {
      status: 'invalid',
      cells: [],
      issues: [{ code: 'DIAGRAM_METADATA_INVALID', message: 'Не удалось прочитать метаданные диаграммы.' }],
    };
  }
}
