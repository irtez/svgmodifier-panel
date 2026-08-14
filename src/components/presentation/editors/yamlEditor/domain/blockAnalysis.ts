import { EditorContext } from '../types';

export interface BlockAnalysis {
  hasIdAbove: boolean;
  existingRules: Set<string>;
  hasAttributes: boolean;
  hasMetrics: boolean;
  hasChanges: boolean;
  hasThresholds: boolean;
  currentBlockRules: Set<string>;
  lineContents: string[];
  blockStart: number;
  blockEnd: number;
  attributesBlockStart: number;
  attributesBlockEnd: number;
}

export const analyzeBlockContext = (ctx: EditorContext): BlockAnalysis => {
  const existingRules = new Set<string>();
  const currentBlockRules = new Set<string>();

  const lineContents =
    ctx.lines ?? Array.from({ length: ctx.model.getLineCount() }, (_, i) => ctx.model.getLineContent(i + 1));

  const currentLine = Math.max(0, ctx.position.lineNumber - 1);
  let blockStart = -1;
  let blockEnd = lineContents.length;
  let attributesBlockStart = -1;
  let attributesBlockEnd = lineContents.length;

  // Найти ближайший вверх '- id:'
  for (let i = currentLine; i >= 0; i--) {
    if (/^\s*-\s*id:/.test(lineContents[i])) {
      blockStart = i;
      break;
    }
  }

  // Найти следующий '- id:' вниз
  for (let i = currentLine + 1; i < lineContents.length; i++) {
    if (/^\s*-\s*id:/.test(lineContents[i])) {
      blockEnd = i;
      break;
    }
  }

  // Найти attributes: внутри найденного блока (если есть)
  if (blockStart !== -1) {
    for (let i = blockStart; i < blockEnd; i++) {
      if (/^\s*attributes:/.test(lineContents[i])) {
        attributesBlockStart = i;
        const baseIndentMatch = lineContents[i].match(/^(\s*)/);
        const baseIndent = baseIndentMatch ? baseIndentMatch[1].length : 0;
        // определить конец attributes: — либо следующий ключ с indent <= baseIndent, либо следующий '- id:'
        for (let j = i + 1; j < lineContents.length; j++) {
          if (/^\s*-\s*id:/.test(lineContents[j])) {
            attributesBlockEnd = j;
            break;
          }
          const m = lineContents[j].match(/^(\s*)([^\s].*)/);
          if (m) {
            const indent = m[1].length;
            const rest = m[2];
            if (/^[\w-]+:/.test(rest) && indent <= baseIndent) {
              attributesBlockEnd = j;
              break;
            }
          }
        }
        break;
      }
    }
  }

  // Собираем правила: глобально и в текущем блоке (между blockStart..blockEnd)
  let hasChanges = false;
  let hasThresholds = false;
  let hasMetrics = false;
  let hasAttributes = false;

  for (let i = 0; i < lineContents.length; i++) {
    const line = lineContents[i];
    const keyMatch = line.match(/^\s*([a-zA-Z0-9_-]+)\s*:/);
    if (keyMatch) {
      const ruleName = keyMatch[1];
      existingRules.add(ruleName);

      if (blockStart !== -1 && i >= blockStart && i < blockEnd) {
        currentBlockRules.add(ruleName);
        if (ruleName === 'attributes') {
          hasAttributes = true;
        }
      }

      if (attributesBlockStart !== -1 && i >= attributesBlockStart && i < attributesBlockEnd) {
        if (ruleName === 'metrics') {
          hasMetrics = true;
        }
      }

      if (ruleName === 'changes') {
        hasChanges = true;
      }
      if (ruleName === 'thresholds') {
        hasThresholds = true;
      }
    }
  }

  return {
    hasIdAbove: blockStart !== -1,
    existingRules,
    hasAttributes,
    hasMetrics,
    hasChanges,
    hasThresholds,
    currentBlockRules,
    lineContents,
    blockStart,
    blockEnd,
    attributesBlockStart,
    attributesBlockEnd,
  };
};

/** Проверка условий позиции курсора (столбец pos, и справа от курсора пусто) */
export const isConditionMet = (ctx: EditorContext, pos: number): boolean => {
  const { lineContent, position } = ctx;
  const isRightEmpty = lineContent.substring(position.column - 1).trim() === '';
  return position.column === pos && isRightEmpty;
};

/** Проверка существования правила в attributes-блоке (учитывает inline-объекты) */
export const ruleExistsInAttributesBlock = (analysis: BlockAnalysis, rule: string): boolean => {
  if (analysis.currentBlockRules.has(rule)) {
    return true;
  }

  if (analysis.attributesBlockStart !== -1) {
    for (let i = analysis.attributesBlockStart; i < analysis.attributesBlockEnd; i++) {
      const line = analysis.lineContents[i];
      if (new RegExp(`(^|[\\s{,])${rule}\\s*:`).test(line)) {
        return true;
      }
      // inline объект вида "- { legend: 'x', calculation: 'y' }"
      if (/\{\s*[^}]*\}/.test(line) && new RegExp(`${rule}\\s*:`).test(line)) {
        return true;
      }
    }
  }

  return false;
};

/** Проверка, находится ли позиция внутри блока metrics (в пределах attributes) */
export const isInMetricsBlockForPosition = (analysis: BlockAnalysis, posLineIndex: number): boolean => {
  if (analysis.attributesBlockStart === -1) {
    return false;
  }
  for (let i = analysis.attributesBlockStart; i < analysis.attributesBlockEnd; i++) {
    if (/^\s*metrics:/.test(analysis.lineContents[i])) {
      const metricsLine = i;
      return posLineIndex >= metricsLine && posLineIndex < analysis.attributesBlockEnd;
    }
  }
  return false;
};
