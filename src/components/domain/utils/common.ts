import { RulesByElementId } from '../models/configModels';

/**
 * Форматирует число с заданным количеством десятичных знаков.
 */
export const roundToFixed = (value: number, decimals = 3): number => {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
};

/**
 * Проверяет, содержит ли строка специальные символы для регулярных выражений.
 */
export function RegexCheck(value: string): boolean {
  const regexSpecialChars = /[.*+?^${}()|[\]\\]/;

  if (regexSpecialChars.test(value)) {
    return true;
  }
  return false;
}

/**
 *
 */
export function matchPattern(pattern: string, target: string): boolean {
  if (pattern === target) {
    return true;
  }

  if (RegexCheck(pattern)) {
    try {
      return new RegExp(pattern).test(target);
    } catch {
      return false;
    }
  }

  return false;
}

export function cleanupResources(
  elements: Map<string, SVGElement> | undefined,
  rulesByElementId: RulesByElementId,
  tempDocument?: Document | undefined
): void {
  if (elements) {
    elements.clear();
  }

  if (tempDocument) {
    const svgElement = tempDocument.documentElement;
    if (svgElement) {
      while (svgElement.firstChild) {
        svgElement.removeChild(svgElement.firstChild);
      }
    }
    (tempDocument as any) = null;
  }

  rulesByElementId.clear();
}
