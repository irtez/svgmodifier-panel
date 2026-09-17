import type { Bounds, DiagramItem, NodePaint, Paint } from './models';

export const SVG_NS = 'http://www.w3.org/2000/svg';
const RESOURCE_TAGS = new Set([
  'defs',
  'metadata',
  'script',
  'style',
  'symbol',
  'clippath',
  'mask',
  'pattern',
  'marker',
  'lineargradient',
  'radialgradient',
  'filter',
]);
export const isResource = (element: Element) => RESOURCE_TAGS.has(element.localName.toLowerCase());

export function scanElements(root: Element, maxNodes = 50000): Element[] {
  const result: Element[] = [];
  const pending = [{ node: root, depth: 0 }];
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    if (depth > 256) {
      throw new Error('CAPTURE_SVG_DEPTH_LIMIT');
    }
    if (result.length + pending.length >= maxNodes || node.childElementCount > maxNodes) {
      throw new Error('CAPTURE_SVG_NODE_LIMIT');
    }
    result.push(node);
    if (!isResource(node)) {
      pending.push(
        ...Array.from(node.children)
          .reverse()
          .map((node) => ({ node, depth: depth + 1 }))
      );
    }
  }
  return result;
}

/** Читает только текст; не вставляет XML/HTML и не включает код/styles в подпись. */
export function authoredText(root: Element): string | null {
  const parts: string[] = [];
  const walk = (node: Node, depth: number) => {
    if (depth > 256) {
      throw new Error('CAPTURE_SVG_DEPTH_LIMIT');
    }
    if (node.nodeType === 3) {
      parts.push(node.textContent ?? '');
      return;
    }
    if (node.nodeType !== 1) {
      return;
    }
    const element = node as Element;
    if (isResource(element)) {
      return;
    }
    const block =
      ['text', 'div', 'p', 'br', 'title', 'desc'].includes(element.localName) ||
      (element.localName === 'tspan' && (element.hasAttribute('x') || element.hasAttribute('dy')));
    if (block) {
      parts.push('\n');
    }
    Array.from(element.childNodes).forEach((child) => walk(child, depth + 1));
    if (block) {
      parts.push('\n');
    }
  };
  walk(root, 0);
  const text = parts
    .join('')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  return text || null;
}

export function href(element: Element | null, root?: Element | null): string | null {
  let current = element;
  while (current) {
    if (current === root || (!root && current.namespaceURI === SVG_NS && current.localName === 'svg')) {
      break;
    }
    if (current.localName === 'a') {
      return current.getAttribute('href') ?? current.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
    }
    current = current.parentElement;
  }
  return null;
}

export function paint(css: string): Paint | null {
  if (!css) {
    return null;
  }
  const match = css.match(/^rgba?\(([^)]+)\)$/);
  let rgba: Paint['rgba'] = null;
  if (match) {
    const parts = match[1].trim().split(/[\s,\/]+/);
    if (parts.length === 3 || parts.length === 4) {
      const values = parts.map((part, index) =>
        part.endsWith('%') ? (Number.parseFloat(part) / 100) * (index === 3 ? 1 : 255) : Number(part)
      );
      if (
        values.every(Number.isFinite) &&
        values.slice(0, 3).every((v) => v >= 0 && v <= 255) &&
        (values[3] === undefined || (values[3] >= 0 && values[3] <= 1))
      ) {
        rgba = [values[0], values[1], values[2], values[3] ?? 1];
      }
    }
  }
  return { css, rgba };
}

const numeric = (text: string): number | null => (text.trim() && Number.isFinite(Number(text)) ? Number(text) : null);

export class DiagramMeasurements {
  private readonly styles = new Map<Element, CSSStyleDeclaration>();
  private readonly layout = new Map<Element, boolean>();
  private readonly opacity = new Map<Element, boolean>();

  constructor(readonly root: Element, readonly viewport: DOMRect) {}

  style(element: Element): CSSStyleDeclaration {
    let style = this.styles.get(element);
    if (!style) {
      style = element.ownerDocument.defaultView!.getComputedStyle(element);
      this.styles.set(element, style);
    }
    return style;
  }

  hasLayout(element: Element): boolean {
    if (this.layout.has(element)) {
      return this.layout.get(element)!;
    }
    const rendered =
      this.style(element).display !== 'none' && (!element.parentElement || this.hasLayout(element.parentElement));
    this.layout.set(element, rendered);
    return rendered;
  }

  hasOpacity(element: Element): boolean {
    if (this.opacity.has(element)) {
      return this.opacity.get(element)!;
    }
    const visible =
      this.style(element).opacity !== '0' && (!element.parentElement || this.hasOpacity(element.parentElement));
    this.opacity.set(element, visible);
    return visible;
  }

  bounds(element: Element): Bounds | null {
    if (!this.hasLayout(element) || !element.getClientRects().length) {
      return null;
    }
    return this.relative(element.getBoundingClientRect());
  }

  relative(rect: DOMRect): Bounds {
    const values = [rect.left, rect.top, rect.width, rect.height, this.viewport.left, this.viewport.top];
    if (!values.every(Number.isFinite)) {
      throw new Error('CAPTURE_SVG_INVALID_GEOMETRY');
    }
    return {
      x: rect.left - this.viewport.left,
      y: rect.top - this.viewport.top,
      width: rect.width,
      height: rect.height,
    };
  }

  visibility(element: Element): DiagramItem['visibility'] {
    const style = this.style(element);
    return { display: style.display || null, visibility: style.visibility || null, opacity: numeric(style.opacity) };
  }

  nodePaint(element: Element, owner: Element, text = false): NodePaint {
    const style = this.style(element);
    const isSvg = element.namespaceURI === SVG_NS;
    const nodePath: number[] = [];
    let current = element;
    while (current !== owner && current.parentElement) {
      nodePath.unshift(Array.from(current.parentElement.children).indexOf(current));
      current = current.parentElement;
    }
    return {
      nodePath,
      svgId: element.getAttribute('id'),
      tag: element.localName,
      fill: isSvg ? paint(style.fill) : null,
      stroke: isSvg ? paint(style.stroke) : null,
      textColor: text ? paint(style.color) : null,
      opacity: numeric(style.opacity),
      fillOpacity: isSvg ? numeric(style.fillOpacity) : null,
      strokeOpacity: isSvg ? numeric(style.strokeOpacity) : null,
      markers: { start: style.markerStart || null, mid: style.markerMid || null, end: style.markerEnd || null },
    };
  }
}

export interface TextFact {
  element: Element;
  flow: Element;
  fragment: DiagramItem['textFragments'][number];
}

export function currentText(root: Element, measurements: DiagramMeasurements, maxChars = 1000000): TextFact[] {
  const result: TextFact[] = [];
  const document = root.ownerDocument;
  const walker = document.createTreeWalker(root, 4); // SHOW_TEXT
  let count = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent) {
      continue;
    }
    let current: Element | null = parent;
    let flow: Element | null = null;
    let excluded = false;
    while (current) {
      if (isResource(current) || ['title', 'desc'].includes(current.localName)) {
        excluded = true;
        break;
      }
      if (['text', 'foreignObject'].includes(current.localName)) {
        flow ??= current;
      }
      if (current === root) {
        break;
      }
      current = current.parentElement;
    }
    if (excluded || !flow || !node.textContent) {
      continue;
    }
    count += node.textContent.length;
    if (count > maxChars) {
      throw new Error('CAPTURE_SVG_TEXT_LIMIT');
    }
    const style = measurements.style(parent);
    if (
      !measurements.hasLayout(parent) ||
      !measurements.hasOpacity(parent) ||
      ['hidden', 'collapse'].includes(style.visibility)
    ) {
      continue;
    }
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
    if (!rects.length) {
      continue;
    }
    const normalized = (text: string) =>
      /^(pre|break-spaces)/.test(style.whiteSpace) ? text : text.replace(/\s+/g, ' ');
    if (rects.length === 1) {
      result.push({
        element: parent,
        flow,
        fragment: {
          text: normalized(node.textContent),
          source: parent.namespaceURI === SVG_NS ? 'svg_text' : 'html_text',
          bounds: measurements.relative(rects[0]),
        },
      });
      continue;
    }
    // Только многострочный text node требует разбиения по фактическим строкам layout.
    let offset = 0;
    let line: { text: string; rect: DOMRect } | undefined;
    const flush = () => {
      if (line && line.text.trim()) {
        result.push({
          element: parent,
          flow: flow!,
          fragment: {
            text: normalized(line.text).trim(),
            source: parent.namespaceURI === SVG_NS ? 'svg_text' : 'html_text',
            bounds: measurements.relative(line.rect),
          },
        });
      }
      line = undefined;
    };
    for (const character of node.textContent) {
      range.setStart(node, offset);
      offset += character.length;
      range.setEnd(node, offset);
      const rect = Array.from(range.getClientRects()).find((value) => value.height > 0);
      if (!rect) {
        continue;
      }
      if (line && Math.abs(rect.top - line.rect.top) > Math.max(1, rect.height * 0.35)) {
        flush();
      }
      if (!line) {
        line = { text: character, rect };
      } else {
        const left = Math.min(line.rect.left, rect.left);
        const top = Math.min(line.rect.top, rect.top);
        line = {
          text: line.text + character,
          rect: new DOMRect(
            left,
            top,
            Math.max(line.rect.right, rect.right) - left,
            Math.max(line.rect.bottom, rect.bottom) - top
          ),
        };
      }
    }
    flush();
  }
  return result;
}

export function textLabel(facts: TextFact[]): string | null {
  let text = '';
  let previous: TextFact | undefined;
  for (const fact of facts) {
    const sameLine =
      previous &&
      previous.flow === fact.flow &&
      Math.abs(previous.fragment.bounds!.y - fact.fragment.bounds!.y) <
        Math.max(1, fact.fragment.bounds!.height * 0.35);
    text += (previous && !sameLine ? '\n' : '') + fact.fragment.text;
    previous = fact;
  }
  return text.trim() || null;
}
