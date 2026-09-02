import { getElementColor } from './helpers';

export function initSVG(svg: string, svgAspectRatio?: string): Document | null {
  if (!svg) {
    return null;
  }

  const cleanSVG = svg.replace(/\s+content="[^"]*"/g, '').replace(/(<\/svg>)[\s\S]*/i, '$1');

  const doc = new DOMParser().parseFromString(cleanSVG, 'image/svg+xml');
  const svgDoc = doc.documentElement;

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

    if (element instanceof SVGTextElement || element instanceof HTMLElement) {
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

  if (!hasLabelColor && !hasLabel) {
    return;
  }

  for (const el of targets.textElements) {
    if (hasLabelColor) {
      applyColorToText(el, color);
    }
    if (hasLabel) {
      applyTextForTextElement(el, text);
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

  if (element instanceof SVGTextElement || element instanceof HTMLElement) {
    const [hasLabelColor, color] = labelColor;
    hasLabelColor && applyColorToText(element, color);

    const [hasLabel, text] = label;
    hasLabel && applyTextForTextElement(element, text);
  }

  if (hasChildren) {
    for (const child of element.children) {
      updateSvgElementRecursive(child, label, labelColor, elColor);
    }
  }
}

function applyColorToElement(element: SVGElement, [fill, stroke, opacity]: ReturnType<typeof getElementColor>): void {
  if (!element.hasAttribute('data-original-fill')) {
    element.setAttribute('data-original-fill', element.getAttribute('fill') || '');
    element.setAttribute('data-original-stroke', element.getAttribute('stroke') || '');
    element.setAttribute('data-original-fill-opacity', element.getAttribute('fill-opacity') || 'false');
  }

  const hasFill = fill && fill !== '';
  const hasStroke = stroke && stroke !== '';
  const hasOpacity = opacity && opacity !== '';

  if (!hasFill && !hasStroke && !hasOpacity) {
    const origFill = element.getAttribute('data-original-fill');
    const origStroke = element.getAttribute('data-original-stroke');
    const origOpacity = element.getAttribute('data-original-fill-opacity');

    origFill && element.setAttribute('fill', origFill);
    origStroke && element.setAttribute('stroke', origStroke);
    origOpacity && element.setAttribute('fill-opacity', origOpacity);
    return;
  }

  element.removeAttribute('style');

  hasFill && element.setAttribute('fill', fill);
  hasStroke && element.setAttribute('stroke', stroke);
  hasOpacity && element.setAttribute('fill-opacity', opacity);
}

function applyColorToText(element: Element, color: string | undefined) {
  const handleSvg = (element: SVGTextElement) => {
    if (!element.hasAttribute('data-original-textColor')) {
      element.setAttribute('data-original-textColor', element.getAttribute('fill') || '');
    }

    if (!color) {
      const origFill = element.getAttribute('data-original-textColor');
      origFill && element.setAttribute('fill', origFill);
      return;
    }

    color && element.setAttribute('fill', color);
  };

  const handleHtml = (element: HTMLElement) => {
    if (!element.hasAttribute('data-original-textColor')) {
      element.setAttribute('data-original-textColor', element.style.color || '');
    }

    if (!color) {
      const origFill = element.getAttribute('data-original-textColor');
      origFill && (element.style.color = origFill);
      return;
    }

    color && (element.style.color = color);
  };

  if (element instanceof SVGTextElement) {
    handleSvg(element);
  } else if (element instanceof HTMLElement) {
    handleHtml(element);
  }
}

function applyTextForTextElement(element: Element, text: string | undefined) {
  for (let i = 0; i < element.childNodes.length; i++) {
    const child = element.childNodes[i];
    if (child.nodeType === Node.TEXT_NODE) {
      if (!element.hasAttribute('data-original-text')) {
        element.setAttribute('data-original-text', child.textContent || '');
      }

      if (!text) {
        const origText = element.getAttribute('data-original-text');
        child.textContent = origText;
        break;
      }

      child.textContent = text;
      break;
    }
  }
}

export function addLinkToElement(svgElement: SVGElement, link?: string): void {
  const parent = svgElement.parentNode;
  if (!parent || svgElement.hasAttribute('data-has-link') || !link) {
    return;
  }

  const linkElement = document.createElementNS('http://www.w3.org/2000/svg', 'a');

  linkElement.setAttribute('target', '_blank');
  linkElement.setAttribute('href', link);

  svgElement.setAttribute('data-has-link', 'true');
  parent.insertBefore(linkElement, svgElement);
  linkElement.appendChild(svgElement);
}
