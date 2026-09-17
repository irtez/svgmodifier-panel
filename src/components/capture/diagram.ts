import { copyJson } from './jsonValues';
import {
  authoredText,
  currentText,
  DiagramMeasurements,
  href,
  isResource,
  scanElements,
  SVG_NS,
  textLabel,
  TextFact,
} from './diagramDom';
import { DiagramMetadata, readDiagramMetadata } from './diagramMetadata';
import type {
  CapturedDiagnostic,
  CapturedDiagram,
  CapturedRule,
  DiagramEndpoint,
  DiagramItem,
  SvgModifierSnapshotV1,
} from './models';

export interface DiagramSource {
  status: 'ready' | 'missing' | 'invalid';
  root: Element | null;
  metadata: DiagramMetadata;
  issues: Array<{ code: string; message: string }>;
}
export interface DiagramCapture {
  diagram: CapturedDiagram;
  diagnostics: CapturedDiagnostic[];
  bindings: Map<string, { diagramItemId: string | null; label: string | null; diagnosticIds: string[] }>;
}

/** Отдельный исходный документ: initSVG удаляет content, а UI меняет текст и ссылки. */
export async function prepareDiagram(source: string): Promise<DiagramSource> {
  const metadata: DiagramMetadata = { status: 'missing', cells: [], issues: [] };
  if (!source.trim()) {
    return { status: 'missing', root: null, metadata, issues: [] };
  }
  if (source.length > 8 * 1024 * 1024) {
    throw new Error('CAPTURE_SVG_SOURCE_LIMIT');
  }
  // Стандартный внешний SVG DOCTYPE допустим; пользовательские сущности — нет.
  const declarations = /<!\s*ENTITY\b|<!DOCTYPE[^>]*\[/i.test(source);
  const document = declarations ? null : new DOMParser().parseFromString(source, 'image/svg+xml');
  const root = document?.documentElement;
  if (
    !root ||
    root.localName !== 'svg' ||
    root.namespaceURI !== SVG_NS ||
    document!.getElementsByTagName('parsererror').length
  ) {
    return {
      status: 'invalid',
      root: null,
      metadata,
      issues: [
        {
          code: 'CAPTURE_SVG_INVALID',
          message: 'Исходный SVG отсутствует в доступном для чтения формате.',
        },
      ],
    };
  }
  const parsed = await readDiagramMetadata(root.getAttribute('content'));
  return { status: 'ready', root, metadata: parsed, issues: parsed.issues };
}

const FIGURES = new Set(['rect', 'circle', 'ellipse', 'path', 'line', 'polyline', 'polygon', 'text']);
const OBJECTS = new Set([...FIGURES, 'svg', 'g', 'a', 'switch', 'image', 'use', 'foreignObject']);
const isObject = (node: Element) =>
  !isResource(node) &&
  ((node.namespaceURI === SVG_NS && OBJECTS.has(node.localName)) ||
    node.hasAttribute('id') ||
    node.hasAttribute('data-cell-id'));

function indexBy(nodes: Element[], attribute: string): Map<string, Element[]> {
  const result = new Map<string, Element[]>();
  for (const node of nodes) {
    const value = node.getAttribute(attribute);
    if (value !== null) {
      const entries = result.get(value) ?? [];
      entries.push(node);
      result.set(value, entries);
    }
  }
  return result;
}

// Обёртки ссылок меняются в updater, но не меняют структурный путь дочерних фигур.
function structuralPaths(root: Element): Map<Element, string> {
  const result = new Map<Element, string>();
  const children = (node: Element): Element[] =>
    Array.from(node.children).flatMap((child) =>
      child.namespaceURI === SVG_NS && child.localName === 'a' ? children(child) : [child]
    );
  const walk = (node: Element, path: string, depth: number) => {
    if (depth > 256) {
      throw new Error('CAPTURE_SVG_DEPTH_LIMIT');
    }
    result.set(node, path);
    if (isResource(node)) {
      return;
    }
    children(node).forEach((child, i) => walk(child, path + '/' + i + ':' + child.localName, depth + 1));
  };
  walk(root, '', 0);
  return result;
}

function sourceMatcher(source: Element, live: Element) {
  if (source === live) {
    return (node: Element) => node;
  }
  const nodes = scanElements(source);
  const ids = indexBy(nodes, 'id');
  const cells = indexBy(nodes, 'data-cell-id');
  const sourcePaths = new Map(Array.from(structuralPaths(source), ([node, path]) => [path, node]));
  const livePaths = structuralPaths(live);
  const liveIds = indexBy(scanElements(live), 'id');
  const liveCells = indexBy(scanElements(live), 'data-cell-id');
  return (node: Element): Element | null => {
    const id = node.getAttribute('id');
    const cell = node.getAttribute('data-cell-id');
    const candidate =
      id !== null
        ? ids.get(id)?.length === 1 && liveIds.get(id)?.length === 1
          ? ids.get(id)![0]
          : null
        : cell !== null
        ? cells.get(cell)?.length === 1 && liveCells.get(cell)?.length === 1
          ? cells.get(cell)![0]
          : null
        : sourcePaths.get(livePaths.get(node) ?? 'not-a-path');
    return candidate?.localName === node.localName &&
      candidate.namespaceURI === node.namespaceURI &&
      candidate.getAttribute('data-cell-id') === cell
      ? candidate
      : null;
  };
}

export function collectDiagram(input: {
  source: DiagramSource;
  root: Element | null;
  mode: 'svg' | 'grid' | 'table';
  rules: readonly CapturedRule[];
}): DiagramCapture {
  const { source, rules } = input;
  const live =
    input.mode === 'svg' &&
    input.root?.isConnected &&
    input.root.namespaceURI === SVG_NS &&
    input.root.localName === 'svg' &&
    input.root.getClientRects().length
      ? input.root
      : null;
  const root = live ?? source.root;
  const viewport = live?.getBoundingClientRect();
  const measurements = live && viewport ? new DiagramMeasurements(live, viewport) : null;
  const diagram: CapturedDiagram = {
    status: live ? 'rendered' : source.status === 'ready' ? 'not_rendered' : source.status,
    coordinateSpace: live ? 'svg-viewport-css-pixels' : null,
    viewport: measurements ? { ...measurements.relative(viewport!), x: 0, y: 0 } : null,
    items: [],
    connections: [],
    diagnosticIds: [],
  };
  const capture: DiagramCapture = { diagram, diagnostics: [], bindings: new Map() };
  const configuredIds = new Set(rules.flatMap((rule) => rule.elementIds));
  const diagnostic = (code: string, message: string, items: DiagramItem[] = [], svgId?: string) => {
    const id = 'diagram-diagnostic-' + capture.diagnostics.length;
    capture.diagnostics.push({
      id,
      code,
      message,
      severity: 'warning',
      source: {
        page: null,
        pageIndex: null,
        path: null,
        line: null,
        column: null,
        metricsIndex: null,
        queryIndex: null,
        thresholdIndex: null,
        rowIndex: null,
        columnIndex: null,
        refId: null,
        legend: null,
        expressionRefId: null,
      },
      elementIds: Array.from(
        new Set(
          [svgId, ...items.map((item) => item.svgId)].filter((id): id is string => id != null && configuredIds.has(id))
        )
      ),
      ruleIds: [],
      metricIds: [],
    });
    diagram.diagnosticIds.push(id);
    items.forEach((item) => item.diagnosticIds.push(id));
    return id;
  };
  source.issues.forEach((issue) => diagnostic(issue.code, issue.message));
  if (!root) {
    return capture;
  }
  const nodes = scanElements(root);
  const objects = nodes.filter(isObject);
  const sourceNode = source.root ? sourceMatcher(source.root, root) : () => null;
  const itemByNode = new Map<Element, DiagramItem>();
  const cellDefinitions = new Map(source.metadata.cells.map((cell) => [cell.id, cell]));
  const nearestItem = (node: Element | null): DiagramItem | undefined => {
    for (let current = node; current; current = current.parentElement) {
      const item = itemByNode.get(current);
      if (item) {
        return item;
      }
      if (current === root) {
        break;
      }
    }
    return undefined;
  };
  const rulesBySvgId = new Map<string, CapturedRule[]>();
  rules.forEach((rule) =>
    rule.elementIds.forEach((id) => {
      const entries = rulesBySvgId.get(id) ?? [];
      entries.push(rule);
      rulesBySvgId.set(id, entries);
    })
  );
  let authoredCharacters = 0;
  for (const node of objects) {
    const original = sourceNode(node);
    const originalText = original ? authoredText(original) : null;
    authoredCharacters += originalText?.length ?? 0;
    // Вложенные группы повторяют подписи потомков: ограничиваем сумму, не только входной SVG.
    if (authoredCharacters > 1_000_000) {
      throw new Error('CAPTURE_SVG_TEXT_LIMIT');
    }
    const svgId = node.getAttribute('id');
    const cellId = node.getAttribute('data-cell-id');
    const declarations: DiagramItem['links']['declarations'] = [];
    const originalHref = href(original, source.root);
    if (originalHref !== null) {
      declarations.push({ origin: 'svg', ruleId: null, value: originalHref });
    }
    for (const rule of svgId !== null ? rulesBySvgId.get(svgId) ?? [] : []) {
      if (Object.prototype.hasOwnProperty.call(rule.attributes, 'link')) {
        declarations.push({ origin: 'rule', ruleId: rule.id, value: copyJson(rule.attributes.link, () => undefined) });
      }
    }
    const item: DiagramItem = {
      id: 'diagram-item-' + diagram.items.length,
      svgId,
      cellId,
      parentId: nearestItem(node.parentElement)?.id ?? null,
      tag: node.localName,
      sourceKind: cellId === null || !original ? null : cellDefinitions.get(cellId)?.kind ?? null,
      order: diagram.items.length,
      authoredText: originalText,
      textFragments: [],
      bounds: measurements?.bounds(node) ?? null,
      visibility: measurements?.visibility(node) ?? { display: null, visibility: null, opacity: null },
      paints:
        measurements && FIGURES.has(node.localName)
          ? [measurements.nodePaint(node, node, node.localName === 'text')]
          : [],
      links: { declarations, applied: live ? href(node, root) : null },
      diagnosticIds: [],
    };
    itemByNode.set(node, item);
    diagram.items.push(item);
    // Новая anonymous a — обычный результат link updater, не рассогласование источников.
    if (live && !original && !(node.localName === 'a' && svgId === null && cellId === null)) {
      diagnostic(
        'CAPTURE_SVG_SOURCE_UNRESOLVED',
        'Не удалось однозначно сопоставить объект с исходным SVG.',
        [item],
        svgId ?? undefined
      );
    }
    if (live && node.localName === 'use') {
      diagnostic(
        'CAPTURE_USE_PAINT_UNAVAILABLE',
        'Оформление содержимого use недоступно без раскрытия SVG-ресурса.',
        [item],
        svgId ?? undefined
      );
    }
  }
  const text = measurements ? currentText(root, measurements) : [];
  const paintedText = new Set<Element>();
  const textByNode = new Map<Element, TextFact[]>();
  for (const fact of text) {
    for (let node: Element | null = fact.element; node; node = node.parentElement) {
      if (node.hasAttribute('id')) {
        const facts = textByNode.get(node) ?? [];
        facts.push(fact);
        textByNode.set(node, facts);
      }
      if (node === root) {
        break;
      }
    }
    const item = nearestItem(fact.element);
    if (!item) {
      continue;
    }
    item.textFragments.push(fact.fragment);
    const owner = objects[item.order];
    if (fact.element !== owner || !item.paints.length) {
      if (!paintedText.has(fact.element)) {
        item.paints.push(measurements!.nodePaint(fact.element, owner, true));
      }
    }
    paintedText.add(fact.element);
  }
  const byCell = indexBy(objects, 'data-cell-id');
  const sourceCells = source.root ? indexBy(scanElements(source.root), 'data-cell-id') : new Map<string, Element[]>();
  const cellItem = (id: string | null): DiagramItem | undefined => {
    if (id === null || byCell.get(id)?.length !== 1 || sourceCells.get(id)?.length !== 1) {
      return undefined;
    }
    const node = byCell.get(id)![0];
    return sourceNode(node) === sourceCells.get(id)![0] ? itemByNode.get(node) : undefined;
  };
  for (const matching of byCell.values()) {
    if (matching.length > 1) {
      diagnostic(
        'CAPTURE_CELL_ID_AMBIGUOUS',
        'data-cell-id встречается более одного раза.',
        matching.map((node) => itemByNode.get(node)!)
      );
    }
  }
  for (const cell of source.metadata.cells) {
    if (cell.kind !== 'edge') {
      continue;
    }
    const edge = cellItem(cell.id);
    const endpoint = (id: string | null, side: 'SOURCE' | 'TARGET'): DiagramEndpoint => {
      const item = cellItem(id);
      if (id !== null && !item) {
        diagnostic(
          'CAPTURE_METADATA_' + side + '_UNRESOLVED',
          'Конец связи из метаданных не сопоставлен с объектом SVG.',
          edge ? [edge] : []
        );
      }
      return { cellId: id, svgId: item?.svgId ?? null, itemId: item?.id ?? null };
    };
    if (!edge) {
      diagnostic('CAPTURE_METADATA_EDGE_UNRESOLVED', 'Связь из метаданных не сопоставлена с объектом SVG.');
    }
    diagram.connections.push({
      id: 'diagram-connection-' + diagram.connections.length,
      origin: 'drawio',
      itemId: edge?.id ?? null,
      source: endpoint(cell.source, 'SOURCE'),
      target: endpoint(cell.target, 'TARGET'),
      markers: { start: cell.startArrow, end: cell.endArrow },
    });
  }
  for (const [id, matching] of indexBy(objects, 'id')) {
    const items = matching.map((node) => itemByNode.get(node)!);
    if (items.length > 1) {
      const problem = diagnostic('CAPTURE_SVG_ID_AMBIGUOUS', 'SVG ID встречается более одного раза.', items, id);
      capture.bindings.set(id, { diagramItemId: null, label: null, diagnosticIds: [problem] });
    } else {
      const item = items[0];
      capture.bindings.set(id, {
        diagramItemId: item.id,
        label: textLabel(textByNode.get(matching[0]) ?? []),
        diagnosticIds: item.diagnosticIds.slice(),
      });
    }
  }
  return capture;
}

/** Добавляет факты рисунка, не меняя расчёт или переданный снимок. */
export function attachDiagram(snapshot: SvgModifierSnapshotV1, capture: DiagramCapture): SvgModifierSnapshotV1 {
  const previous = new Set(snapshot.diagram.diagnosticIds.filter((id) => id.startsWith('diagram-diagnostic-')));
  const diagnostics = snapshot.diagnostics.filter((item) => !previous.has(item.id));
  const knownElements = new Set(snapshot.elements.map((element) => element.id));
  return {
    ...snapshot,
    diagnostics: [
      ...diagnostics,
      ...capture.diagnostics.map((item) => ({
        ...item,
        elementIds: item.elementIds.filter((id) => knownElements.has(id)),
      })),
    ],
    diagram: capture.diagram,
    elements: snapshot.elements.map((element) => {
      const binding = capture.bindings.get(element.id);
      return {
        ...element,
        diagramItemId: binding?.diagramItemId ?? null,
        label: binding?.label ?? null,
        diagnosticIds: [...element.diagnosticIds.filter((id) => !previous.has(id)), ...(binding?.diagnosticIds ?? [])],
      };
    }),
  };
}
