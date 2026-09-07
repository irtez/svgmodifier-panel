import { getElementColor } from './helpers';

export function initSVG(svg: string, svgAspectRatio?: string): Document | null {
  if (!svg) {
    return null;
  }

  const cleanSVG = svg.replace(/\s+content="[^"]*"/g, '').replace(/(<\/svg>)[\s\S]*/i, '$1');

  const doc = new DOMParser().parseFromString(cleanSVG, 'image/svg+xml');
  const svgDoc = doc.documentElement;

  if (
    svgDoc.localName !== 'svg' ||
    svgDoc.namespaceURI !== 'http://www.w3.org/2000/svg' ||
    doc.querySelector('parsererror')
  ) {
    return null;
  }

  svgDoc.setAttribute('width', '100%');
  svgDoc.setAttribute('height', '100%');

  if (svgAspectRatio && svgAspectRatio !== 'disable') {
    svgDoc.setAttribute('preserveAspectRatio', svgAspectRatio);
  }

  return doc;
}

export function svgToString(svg: Document): string {
  const serializer = new XMLSerializer();
  return serializer.serializeToString(svg);
}

export function updateSvg(operations: Array<() => void>, svgRoot: SVGElement | null | undefined): void {
  if (!svgRoot) {
    operations.forEach((op) => op());
    return;
  }

  const originalStyle = svgRoot.getAttribute('style') || '';
  svgRoot.setAttribute('style', `${originalStyle}; transition: none !important; animation: none !important;`);

  try {
    operations.forEach((op) => op());
  } finally {
    if (originalStyle) {
      svgRoot.setAttribute('style', originalStyle);
    } else {
      svgRoot.removeAttribute('style');
    }
  }
}

export interface SvgUpdateTargets {
  /** Элементы, которым может назначаться fill/stroke/opacity (без вложенного текста и не foreignObject) */
  colorableElements: SVGElement[];
  /** Текстовые узлы (SVG или HTML), которым может назначаться цвет текста и содержимое */
  textElements: Array<SVGTextElement | HTMLElement>;
}

/**
 * НОВОЕ: один обход поддерева, который ЗАПОМИНАЕТ, какие узлы вообще могут
 * быть целью обновления (по структуре DOM — это не меняется между
 * обновлениями данных, только при смене самого SVG-кода).
 *
 * КЛЮЧЕВОЙ ФИКС: раньше eligibility-проверка "нет ли текста внутри" делалась
 * через `element.querySelector('text')` НА КАЖДЫЙ элемент при КАЖДОМ вызове
 * updateSvgElementRecursive — а querySelector сам обходит всё поддерево этого
 * элемента. Для дерева из N узлов с вложенными группами это давало не O(N), а
 * O(N * средний_размер_поддерева) — то есть реально близко к квадратичному
 * росту на сложных схемах. Здесь этот обход выполняется РОВНО ОДИН РАЗ на
 * весь узел (см. collectSvgUpdateTargets), а результат кэшируется в WeakMap
 * низкоуровневого SVG operation adapter.
 */
export function collectSvgUpdateTargets(root: Element): SvgUpdateTargets {
  const colorableElements: SVGElement[] = [];
  const textElements: Array<SVGTextElement | HTMLElement> = [];

  const walk = (element: Element) => {
    if (element instanceof SVGElement) {
      if (element.tagName !== 'foreignObject' && !element.querySelector('text')) {
        colorableElements.push(element);
      }
    }

    if (isSvgTextElement(element) || element instanceof HTMLElement) {
      textElements.push(element);
    }

    for (const child of element.children) {
      walk(child);
    }
  };

  walk(root);
  return { colorableElements, textElements };
}

/**
 * Применяет обновления к уже собранному (закэшированному) списку целевых
 * узлов — без повторного обхода дерева и без querySelector.
 */
export function applySvgUpdateTargets(
  targets: SvgUpdateTargets,
  label: [boolean, string | undefined],
  labelColor: [boolean, string | undefined],
  elColor?: ReturnType<typeof getElementColor>
): void {
  if (elColor) {
    for (const el of targets.colorableElements) {
      applyColorToElement(el, elColor);
    }
  }

  const [hasLabelColor, color] = labelColor;
  const [hasLabel, text] = label;

  for (const el of targets.textElements) {
    if (hasLabelColor) {
      applyColorToText(el, color);
    } else {
      restoreTextColor(el, !elColor);
    }
    if (hasLabel) {
      applyTextForTextElement(el, text);
    } else {
      restoreTextForTextElement(el);
    }
  }
}

/**
 * Оставлена для обратной совместимости (fallback, если по какой-то причине
 * кэш целевых узлов недоступен — см. operations.ts). Логика не менялась.
 */
export function updateSvgElementRecursive(
  element: Element,
  label: [boolean, string | undefined],
  labelColor: [boolean, string | undefined],
  elColor?: ReturnType<typeof getElementColor>
): void {
  const hasChildren = element.children.length > 0;

  if (elColor && element instanceof SVGElement) {
    if (element.tagName !== 'foreignObject' && !element.querySelector('text')) {
      applyColorToElement(element, elColor);
    }
  }

  if (isSvgTextElement(element) || element instanceof HTMLElement) {
    const [hasLabelColor, color] = labelColor;
    if (hasLabelColor) {
      applyColorToText(element, color);
    } else {
      restoreTextColor(element, !elColor);
    }

    const [hasLabel, text] = label;
    if (hasLabel) {
      applyTextForTextElement(element, text);
    } else {
      restoreTextForTextElement(element);
    }
  }

  if (hasChildren) {
    for (const child of element.children) {
      updateSvgElementRecursive(child, label, labelColor, elColor);
    }
  }
}

function isSvgTextElement(element: Element): element is SVGTextElement {
  return typeof SVGTextElement !== 'undefined' && element instanceof SVGTextElement;
}

function originalKey(key: string, suffix: string): string {
  return `data-original-${key}-${suffix}`;
}

function snapshotPaint(element: SVGElement, key: string, attribute: string, styleProperty: string): void {
  const presentKey = originalKey(key, 'present');
  if (element.hasAttribute(presentKey)) {
    return;
  }

  const value = element.getAttribute(attribute);
  element.setAttribute(`data-original-${key}`, value || '');
  element.setAttribute(presentKey, value === null ? 'false' : 'true');

  const styleValue = element.style.getPropertyValue(styleProperty);
  element.setAttribute(originalKey(key, 'style'), styleValue);
  element.setAttribute(originalKey(key, 'style-present'), styleValue ? 'true' : 'false');
  element.setAttribute(originalKey(key, 'style-priority'), element.style.getPropertyPriority(styleProperty));
}

function restorePaint(element: SVGElement, key: string, attribute: string, styleProperty: string): void {
  const presentKey = originalKey(key, 'present');
  if (!element.hasAttribute(presentKey)) {
    return;
  }

  if (element.getAttribute(presentKey) === 'true') {
    element.setAttribute(attribute, element.getAttribute(`data-original-${key}`) || '');
  } else {
    element.removeAttribute(attribute);
  }

  if (element.getAttribute(originalKey(key, 'style-present')) === 'true') {
    element.style.setProperty(
      styleProperty,
      element.getAttribute(originalKey(key, 'style')) || '',
      element.getAttribute(originalKey(key, 'style-priority')) || ''
    );
  } else {
    element.style.removeProperty(styleProperty);
  }
}

function applyPaint(
  element: SVGElement,
  key: string,
  attribute: string,
  styleProperty: string,
  value: string | null
): void {
  if (!value) {
    restorePaint(element, key, attribute, styleProperty);
    return;
  }

  snapshotPaint(element, key, attribute, styleProperty);
  element.style.removeProperty(styleProperty);
  element.setAttribute(attribute, value);
}

function applyColorToElement(element: SVGElement, [fill, stroke, opacity]: ReturnType<typeof getElementColor>): void {
  applyPaint(element, 'fill', 'fill', 'fill', fill);
  applyPaint(element, 'stroke', 'stroke', 'stroke', stroke);
  applyPaint(element, 'fill-opacity', 'fill-opacity', 'fill-opacity', opacity);
}

function applyColorToText(element: SVGTextElement | HTMLElement, color: string | undefined): void {
  if (isSvgTextElement(element)) {
    // SVG text is also a colorable SVG element. Use its one physical fill
    // snapshot so removing labelColor reveals the current element color,
    // rather than restoring the color that was dynamic in the prior update.
    applyPaint(element, 'fill', 'fill', 'fill', color || null);
    return;
  }

  if (!element.hasAttribute('data-original-textColor-present')) {
    element.setAttribute('data-original-textColor', element.style.color || '');
    element.setAttribute('data-original-textColor-present', element.style.color ? 'true' : 'false');
    element.setAttribute('data-original-textColor-priority', element.style.getPropertyPriority('color'));
  }
  if (color) {
    element.style.color = color;
  } else {
    restoreTextColor(element);
  }
}

function restoreTextColor(element: SVGTextElement | HTMLElement, restoreSvgFill = false): void {
  if (isSvgTextElement(element)) {
    // With an element color, applyColorToElement has already restored or
    // applied this update's fill. Direct text-only callers need the same
    // shared snapshot restored here.
    if (restoreSvgFill) {
      restorePaint(element, 'fill', 'fill', 'fill');
    }
    return;
  } else if (element.hasAttribute('data-original-textColor-present')) {
    if (element.getAttribute('data-original-textColor-present') === 'true') {
      element.style.setProperty(
        'color',
        element.getAttribute('data-original-textColor') || '',
        element.getAttribute('data-original-textColor-priority') || ''
      );
    } else {
      element.style.removeProperty('color');
    }
  }
}

function applyTextForTextElement(element: Element, text: string | undefined) {
  for (const child of element.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      if (!element.hasAttribute('data-original-text')) {
        element.setAttribute('data-original-text', child.textContent || '');
      }
      child.textContent = text || element.getAttribute('data-original-text') || '';
      return;
    }
  }
}

function restoreTextForTextElement(element: SVGTextElement | HTMLElement): void {
  if (!element.hasAttribute('data-original-text')) {
    return;
  }

  for (const child of element.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      child.textContent = element.getAttribute('data-original-text') || '';
      return;
    }
  }
}

export function addLinkToElement(svgElement: SVGElement, link?: string): void {
  updateLinkForElement(svgElement, link);
}

function linkElementFor(svgElement: SVGElement): SVGElement | null {
  if (svgElement.localName === 'a') {
    return svgElement;
  }

  const parent = svgElement.parentElement;
  // A shared authored anchor also belongs to siblings outside this rule.
  return parent instanceof SVGElement && parent.localName === 'a' && parent.childElementCount === 1 ? parent : null;
}

function restoreOriginalLink(svgElement: SVGElement, linkElement: SVGElement): void {
  if (!svgElement.hasAttribute('data-original-link-href-present')) {
    return;
  }

  if (svgElement.getAttribute('data-original-link-href-present') === 'true') {
    linkElement.setAttribute('href', svgElement.getAttribute('data-original-link-href') || '');
  } else {
    linkElement.removeAttribute('href');
  }
  svgElement.removeAttribute('data-original-link-href');
  svgElement.removeAttribute('data-original-link-href-present');
}

export function updateLinkForElement(svgElement: SVGElement, link?: string): void {
  const existingLink = linkElementFor(svgElement);

  if (link) {
    if (existingLink) {
      if (!svgElement.hasAttribute('data-has-link') && !svgElement.hasAttribute('data-original-link-href-present')) {
        const originalHref = existingLink.getAttribute('href');
        svgElement.setAttribute('data-original-link-href', originalHref || '');
        svgElement.setAttribute('data-original-link-href-present', originalHref === null ? 'false' : 'true');
      }
      existingLink.setAttribute('href', link);
      return;
    }

    const parent = svgElement.parentNode;
    if (!parent) {
      return;
    }
    const linkElement = document.createElementNS('http://www.w3.org/2000/svg', 'a');
    linkElement.setAttribute('target', '_blank');
    linkElement.setAttribute('href', link);
    svgElement.setAttribute('data-has-link', 'true');
    parent.insertBefore(linkElement, svgElement);
    linkElement.appendChild(svgElement);
    return;
  }

  if (svgElement.hasAttribute('data-has-link') && existingLink?.parentNode) {
    existingLink.parentNode.insertBefore(svgElement, existingLink);
    existingLink.remove();
    svgElement.removeAttribute('data-has-link');
  } else if (existingLink) {
    restoreOriginalLink(svgElement, existingLink);
  }
}
