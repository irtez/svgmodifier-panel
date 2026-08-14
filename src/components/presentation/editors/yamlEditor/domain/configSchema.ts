import { SUGGESTION_GROUPS } from '../suggestions/suggestionGroups';
import { EditorContext, SuggestionItem } from '../types';
import {
  BlockAnalysis,
  isConditionMet,
  ruleExistsInAttributesBlock,
  isInMetricsBlockForPosition,
} from './blockAnalysis';

export interface SchemaEntry {
  key?: string;
  indent?: number;
  condition: (ctx: EditorContext, analysis: BlockAnalysis) => boolean | Promise<boolean>;
  items:
    | SuggestionItem[]
    | ((ctx: EditorContext, analysis: BlockAnalysis) => SuggestionItem[] | Promise<SuggestionItem[]>);
}

export const configSchema: SchemaEntry[] = [
  {
    key: 'id',
    indent: 2,
    condition: (ctx, analysis) => {
      const isInChangesBlock = analysis.lineContents.some(
        (line, idx) => line.includes('changes:') && idx < ctx.position.lineNumber - 1
      );
      return isConditionMet(ctx, 3) && isInChangesBlock;
    },
    items: [...SUGGESTION_GROUPS.CHANGES],
  },
  {
    key: 'attributes',
    condition: (ctx, analysis) => {
      const isInMetricsBlock = analysis.lineContents.some(
        (line, idx) =>
          idx < ctx.position.lineNumber - 1 &&
          line.includes('metrics:') &&
          idx >= analysis.blockStart &&
          idx < analysis.blockEnd
      );

      return analysis.hasIdAbove && analysis.hasAttributes && !isInMetricsBlock;
    },
    items: (ctx, analysis): SuggestionItem[] => {
      const allItems: SuggestionItem[] = [...SUGGESTION_GROUPS.ATTRIBUTES];

      return allItems.filter((item) => {
        const exists = analysis.currentBlockRules.has(item.label);
        if (item.label === 'add mapping') {
          return (
            !exists &&
            ctx.position.column === 9 &&
            analysis.currentBlockRules.has('valueMapping') &&
            analysis.lineContents.some((line) => line.includes('- { condition'))
          );
        }
        return !exists && ctx.position.column === 7;
      });
    },
  },
  {
    key: 'metrics',
    condition: (ctx, analysis) => {
      const validColumns = [9, 11, 13, 14];

      const isInMetricsBlock = analysis.lineContents.some(
        (line, idx) =>
          idx < ctx.position.lineNumber - 1 &&
          line.includes('metrics:') &&
          idx >= analysis.blockStart &&
          idx < analysis.blockEnd
      );

      return (
        validColumns.includes(ctx.position.column) && analysis.hasIdAbove && analysis.hasAttributes && isInMetricsBlock
      );
    },
    items: (ctx, analysis): SuggestionItem[] => {
      const allItems: SuggestionItem[] = [...SUGGESTION_GROUPS.METRICS];

      const currentLine = ctx.position.lineNumber - 1;
      const line = ctx.lineContent;

      // Определяем, внутри ли мы inline-объекта (например "- { legend: '', calculation: '' }")
      let isInsideObject = /\{\s*[^}]*$/.test(line) && !/\}/.test(line);
      if (!isInsideObject) {
        for (let i = currentLine - 1; i >= Math.max(0, currentLine - 10); i--) {
          const l = analysis.lineContents[i];
          if (l.includes('{') && !l.includes('}')) {
            isInsideObject = true;
            break;
          }
          if (l.includes('}')) {
            break;
          }
        }
      }

      const isInMetrics = isInMetricsBlockForPosition(analysis, currentLine);

      let inQueriesArray = false;
      let inThresholdsArray = false;

      if (analysis.attributesBlockStart !== -1) {
        for (let i = currentLine; i >= analysis.attributesBlockStart; i--) {
          const l = analysis.lineContents[i].trim();
          if (l.startsWith('queries:')) {
            inQueriesArray = true;
            break;
          }
          if (l.startsWith('thresholds:')) {
            inThresholdsArray = true;
            break;
          }
          if (l.startsWith('metrics:') && i !== currentLine) {
            break;
          }
        }
      }

      return allItems.filter((item) => {
        const exists = isInsideObject
          ? new RegExp(`(^|[\\s{,])${item.label}\\s*:`).test(line)
          : ruleExistsInAttributesBlock(analysis, item.label);

        if (isInMetrics) {
          if (item.label === 'queries') {
            return !exists && ctx.position.column === 9;
          }

          if (['decimal', 'baseColor', 'filling', 'thresholds'].includes(item.label)) {
            return !exists && ctx.position.column === 9;
          }

          if (inThresholdsArray) {
            if (item.label === 'add threshold') {
              return (
                !exists &&
                ctx.position.column === 11 &&
                ruleExistsInAttributesBlock(analysis, 'thresholds') &&
                analysis.lineContents
                  .slice(analysis.attributesBlockStart, analysis.attributesBlockEnd)
                  .some((l) => /\-\s*\{\s*color\s*:/.test(l))
              );
            }
            if (['color', 'value', 'state'].includes(item.label)) {
              const lineBeforeCursor = ctx.lineContent.substring(0, ctx.position.column - 1);
              return !new RegExp(`\\b${item.label}\\s*:`).test(lineBeforeCursor);
            }
          }

          if (inQueriesArray) {
            if (item.label === 'add query') {
              return !exists && ctx.position.column === 11 && ruleExistsInAttributesBlock(analysis, 'queries');
            }
            if (['refId', 'legend'].includes(item.label)) {
              const lineBeforeCursor = ctx.lineContent.substring(0, ctx.position.column - 1);
              return !new RegExp(`\\b${item.label}\\s*:`).test(lineBeforeCursor);
            }
          }
          return false;
        }
        return false;
      });
    },
  },
  {
    key: 'inlineMetrics',
    condition: (ctx, analysis) => {
      const currentLine = ctx.position.lineNumber - 1;

      const lineBeforeCursor = ctx.lineContent.substring(0, ctx.position.column - 1);
      const isInInlineObject = /\{\s*[^}]*$/.test(lineBeforeCursor);

      if (!isInInlineObject) {
        return false;
      }

      if (analysis.attributesBlockStart === -1) {
        return false;
      }

      let inQueriesArray = false;
      let inThresholdsArray = false;

      for (let i = currentLine; i >= analysis.attributesBlockStart; i--) {
        const line = analysis.lineContents[i].trim();
        if (line.startsWith('queries:')) {
          inQueriesArray = true;
          break;
        }
        if (line.startsWith('thresholds:')) {
          inThresholdsArray = true;
          break;
        }
        if (line.startsWith('metrics:') && i !== currentLine) {
          break;
        }
      }

      return (inQueriesArray || inThresholdsArray) && isInInlineObject;
    },
    items: (ctx, analysis): SuggestionItem[] => {
      const currentLine = ctx.position.lineNumber - 1;

      let inQueriesArray = false;
      let inThresholdsArray = false;

      for (let i = currentLine; i >= analysis.attributesBlockStart; i--) {
        const line = analysis.lineContents[i].trim();
        if (line.startsWith('queries:')) {
          inQueriesArray = true;
          break;
        }
        if (line.startsWith('thresholds:')) {
          inThresholdsArray = true;
          break;
        }
        if (line.startsWith('metrics:') && i !== currentLine) {
          break;
        }
      }

      if (inQueriesArray) {
        return [...SUGGESTION_GROUPS.QUERY].filter((item) => {
          const lineBeforeCursor = ctx.lineContent.substring(0, ctx.position.column - 1);
          return !new RegExp(`\\b${item.label}\\s*:`).test(lineBeforeCursor);
        });
      } else if (inThresholdsArray) {
        return [...SUGGESTION_GROUPS.THRESHOLD].filter((item) => {
          const lineBeforeCursor = ctx.lineContent.substring(0, ctx.position.column - 1);
          return !new RegExp(`\\b${item.label}\\s*:`).test(lineBeforeCursor);
        });
      }

      return [];
    },
  },
  {
    condition: (ctx) => /-\s*{[^}]*\bcolor\s*:/.test(ctx.lineContent),
    items: (ctx): SuggestionItem[] => {
      const allItems: SuggestionItem[] = [...SUGGESTION_GROUPS.THRESHOLD];
      return allItems.filter((item) => !new RegExp(`${item.label}:`).test(ctx.lineContent));
    },
  },
  {
    key: 'defConfig',
    condition: (ctx, analysis) => {
      const hasChangesAbove = analysis.lineContents.some(
        (line, idx) => line.includes('changes:') && idx < ctx.position.lineNumber - 1
      );
      return isConditionMet(ctx, 3) && hasChangesAbove;
    },
    items: [...SUGGESTION_GROUPS.DEFS],
  },
  {
    key: 'thresholds',
    condition: (ctx, analysis) => {
      const hasChangesBelow = analysis.lineContents.some(
        (line, idx) => idx > ctx.position.lineNumber - 1 && line.includes('changes:')
      );
      return isConditionMet(ctx, 1) && hasChangesBelow;
    },
    items: [...SUGGESTION_GROUPS.ROOT],
  },
];
