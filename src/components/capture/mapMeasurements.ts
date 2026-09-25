import { capturePaint } from './colors';
import type { AppearanceV2 } from './modelsV2';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface TextRow {
  node: Element;
  nodes: Element[];
  flow: Element;
  text: string;
  box: Box;
}
const resources = 'defs,metadata,script,style,symbol,clipPath,mask,pattern,marker,linearGradient,radialGradient,filter';
const shapes = new Set(['rect', 'circle', 'ellipse', 'path', 'polygon', 'polyline', 'line', 'image', 'use']);
const number = (value: string, fallback = 1) =>
  value.trim() && Number.isFinite(Number(value)) ? Number(value) : fallback;
export const area = (b: Box) => b.width * b.height;
export const encloses = (outer: Box, inner: Box) =>
  inner.x >= outer.x - 0.5 &&
  inner.y >= outer.y - 0.5 &&
  inner.x + inner.width <= outer.x + outer.width + 0.5 &&
  inner.y + inner.height <= outer.y + outer.height + 0.5;
export function union(boxes: Box[]): Box | null {
  if (!boxes.length) {
    return null;
  }
  const x = Math.min(...boxes.map((b) => b.x)),
    y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
  };
}

/** All geometry is capture-local and discarded before publication. */
export class MapMeasurements {
  private styles = new Map<Element, CSSStyleDeclaration>();
  private layouts = new Map<Element, boolean>();
  private opacities = new Map<Element, number>();
  private effects = new Map<Element, boolean>();
  hasUncertainVisibility = false;
  constructor(readonly root: Element) {}
  style(node: Element) {
    if (!this.styles.has(node)) {
      this.styles.set(node, node.ownerDocument.defaultView!.getComputedStyle(node));
    }
    return this.styles.get(node)!;
  }
  layout(node: Element): boolean {
    if (!this.layouts.has(node)) {
      this.layouts.set(
        node,
        this.style(node).display !== 'none' && (!node.parentElement || this.layout(node.parentElement))
      );
    }
    return this.layouts.get(node)!;
  }
  opacity(node: Element): number {
    if (!this.opacities.has(node)) {
      this.opacities.set(
        node,
        number(this.style(node).opacity) * (node.parentElement ? this.opacity(node.parentElement) : 1)
      );
    }
    return this.opacities.get(node)!;
  }
  visible(node: Element): boolean {
    return (
      node.isConnected &&
      this.layout(node) &&
      this.opacity(node) > 0 &&
      !['hidden', 'collapse'].includes(this.style(node).visibility)
    );
  }
  painted(node: Element, text = false): boolean {
    const style = this.style(node);
    const solidOrUnknown = (css: string) => {
      const paint = capturePaint(css);
      return paint.kind !== 'none' && (paint.rgba === null || paint.rgba[3] > 0);
    };
    if (node.namespaceURI !== 'http://www.w3.org/2000/svg') {
      return solidOrUnknown(style.color) || (!!style.textShadow && style.textShadow !== 'none');
    }
    if (!text && ['image', 'use'].includes(node.localName)) {
      return true;
    }
    return (
      (number(style.fillOpacity) > 0 && solidOrUnknown(style.fill)) ||
      (number(style.strokeOpacity) > 0 && parseFloat(style.strokeWidth || '1') > 0 && solidOrUnknown(style.stroke))
    );
  }
  uncertain(node: Element): boolean {
    if (!this.effects.has(node)) {
      const style = this.style(node);
      const uncertain =
        [style.clipPath, style.maskImage].some((value) => !!value && value !== 'none') ||
        (!!node.parentElement && this.uncertain(node.parentElement));
      this.effects.set(node, uncertain);
      this.hasUncertainVisibility ||= uncertain;
    }
    return this.effects.get(node)!;
  }
  box(rect: DOMRect): Box {
    const { x, y, width, height } = rect;
    if (![x, y, width, height].every(Number.isFinite)) {
      throw new Error('CAPTURE_SVG_INVALID_GEOMETRY');
    }
    return { x, y, width, height };
  }
  elements(): Element[] {
    const pending = [{ node: this.root, depth: 0 }],
      nodes: Element[] = [];
    while (pending.length) {
      const { node, depth } = pending.pop()!;
      if (depth > 256 || nodes.length + pending.length + node.childElementCount > 50000) {
        throw new Error('CAPTURE_SVG_COMPLEXITY_LIMIT');
      }
      if (node.matches(resources)) {
        continue;
      }
      nodes.push(node);
      pending.push(
        ...Array.from(node.children)
          .reverse()
          .map((node) => ({ node, depth: depth + 1 }))
      );
    }
    return nodes;
  }
  figures(nodes: Element[]) {
    return nodes
      .filter(
        (n) =>
          shapes.has(n.localName) &&
          this.visible(n) &&
          !this.uncertain(n) &&
          this.painted(n) &&
          n.getClientRects().length
      )
      .map((node) => ({ node, box: this.box(node.getBoundingClientRect()) }));
  }
  texts(nodes: Element[], targets: ReadonlySet<Element>): TextRow[] {
    type Fragment = TextRow & { owner: Element | null; block: Element };
    const fragments: Fragment[] = [];
    let chars = 0;
    for (const parent of nodes) {
      if (
        !this.visible(parent) ||
        this.uncertain(parent) ||
        !this.painted(parent, true) ||
        parent.closest('title,desc')
      ) {
        continue;
      }
      const flow = parent.closest('text,foreignObject');
      if (!flow || !this.root.contains(flow)) {
        continue;
      }
      let owner: Element | null = parent;
      while (owner && this.root.contains(owner) && !targets.has(owner)) {
        owner = owner.parentElement;
      }
      if (owner && !this.root.contains(owner)) {
        owner = null;
      }
      let block = parent;
      while (block !== flow && this.style(block).display === 'inline' && block.parentElement) {
        block = block.parentElement;
      }
      for (const node of Array.from(parent.childNodes)) {
        if (node.nodeType !== 3 || !node.textContent?.trim()) {
          continue;
        }
        chars += node.textContent.length;
        if (chars > 1000000) {
          throw new Error('CAPTURE_SVG_TEXT_LIMIT');
        }
        const range = node.ownerDocument!.createRange();
        range.selectNodeContents(node);
        // jsdom has no SVG layout; the browser suite covers these measurements.
        if (!range.getClientRects) {
          continue;
        }
        const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
        if (rects.length) {
          // Automatic wrapping does not turn one authored text node into several names.
          fragments.push({
            node: parent,
            nodes: [parent],
            flow,
            owner,
            block,
            text: node.textContent,
            box: union(rects.map((r) => this.box(r)))!,
          });
        }
      }
    }
    const rows: Fragment[] = [];
    for (const f of fragments) {
      const last = rows[rows.length - 1];
      if (
        last &&
        last.flow === f.flow &&
        last.owner === f.owner &&
        last.block === f.block &&
        Math.abs(last.box.y - f.box.y) < Math.min(last.box.height, f.box.height) * 0.35
      ) {
        last.text += f.text;
        last.box = union([last.box, f.box])!;
        last.nodes.push(...f.nodes);
      } else {
        rows.push({ ...f });
      }
    }
    return rows.map((row) => ({ ...row, text: row.text.replace(/\s+/g, ' ').trim() })).filter((row) => row.text);
  }
  appearance(node: Element, text: boolean): AppearanceV2 {
    const style = this.style(node),
      svg = node.namespaceURI === 'http://www.w3.org/2000/svg';
    return {
      part: node.localName,
      fill: svg && style.fill ? capturePaint(style.fill) : null,
      stroke: svg && style.stroke ? capturePaint(style.stroke) : null,
      textColor: text && style.color ? capturePaint(style.color) : null,
      opacity: number(style.opacity),
      effectiveOpacity: this.opacity(node),
      fillOpacity: svg ? number(style.fillOpacity) : null,
      strokeOpacity: svg ? number(style.strokeOpacity) : null,
    };
  }
}

export function appliedHref(node: Element, root: Element): string | null {
  for (let n: Element | null = node; n && root.contains(n); n = n.parentElement) {
    if (n.localName === 'a') {
      return n.getAttribute('href') ?? n.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
    }
  }
  return null;
}

/** Updater stores authored href before overriding it; its generated wrappers are not declarations. */
export function declaredHref(node: Element, root: Element): string | null {
  let generated: Element | null = null;
  for (let n: Element | null = node; n && root.contains(n); n = n.parentElement) {
    const original = n.getAttribute('data-original-link-href-present');
    if (original === 'true') {
      return n.getAttribute('data-original-link-href');
    }
    if (original === 'false') {
      const anchor = n.localName === 'a' ? n : n.parentElement;
      return anchor?.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? null;
    }
    if (n.getAttribute('data-has-link') === 'true') {
      generated = n.parentElement;
    }
    if (n.localName === 'a' && n !== generated) {
      return n.getAttribute('href') ?? n.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
    }
  }
  return null;
}
