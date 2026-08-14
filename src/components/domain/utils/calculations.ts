import { Expr } from 'types';
import { TimeRange } from '@grafana/data';
import { DataFrameMap } from '../models';
import { matchPattern, roundToFixed } from 'components/domain/utils/common';
import { CalculationMethod, Metrics, Threshold, ValueMapping, filter } from 'components/domain/models';

export function compareValues(a: number, b: number, operator: string): boolean {
  switch (operator) {
    case '<':
      return a < b;
    case '>':
      return a > b;
    case '>=':
      return a >= b;
    case '<=':
      return a <= b;
    case '=':
      return a === b;
    case '!=':
      return a !== b;
    default:
      return false;
  }
}

export function getMappingMatch(mapping: ValueMapping[], value: number, decimal?: number): string | undefined {
  if (!mapping.length) {
    return undefined;
  }

  const sortMappings = (mappings: ValueMapping[]): ValueMapping[] => {
    return [...mappings].sort((a, b) => {
      const aVal = a.value ?? 0;
      const bVal = b.value ?? 0;
      const aIsHighPriority = a.condition && ['>', '>='].includes(a.condition);
      const bIsHighPriority = b.condition && ['>', '>='].includes(b.condition);

      return aIsHighPriority === bIsHighPriority ? aVal - bVal : aIsHighPriority ? -1 : 1;
    });
  };

  const replaceLabel = (label: string, value: number): string => {
    const formattedValue = roundToFixed(value, decimal);
    return label.replace(/\{{value\}}/g, formattedValue.toString());
  };

  const valueMapping = sortMappings(mapping);

  for (let i = valueMapping.length - 1; i >= 0; i--) {
    const mapping = valueMapping[i];
    if (mapping.value !== undefined && mapping.condition && compareValues(value, mapping.value, mapping.condition)) {
      return replaceLabel(mapping.label, value);
    }
  }

  return undefined;
}

export function calculateValue(values: number[], method: CalculationMethod): number {
  if (values.length === 0) {
    return 0;
  }

  let result: number;
  switch (method) {
    case 'last':
      result = values[values.length - 1];
      break;
    case 'total':
      result = values.reduce((a, b) => a + b, 0);
      break;
    case 'max':
      result = Math.max(...values);
      break;
    case 'min':
      result = Math.min(...values);
      break;
    case 'count':
      result = values.length;
      break;
    case 'delta':
      result = values[values.length - 1] - values[0];
      break;
    default:
      result = values[values.length - 1];
  }

  return result;
}

export function getMetricColor(value: number, dataFrame: DataFrameMap, thresholds?: Threshold[], baseColor?: string) {
  let lvl = 0;
  let color = baseColor;

  thresholds?.forEach((threshold, index) => {
    if (threshold.condition && !evaluateThresholdCondition(threshold.condition, dataFrame)) {
      return;
    }

    const comparisonResult = compareValues(value, threshold.value, threshold.operator || '>=');

    if (comparisonResult) {
      color = threshold.color;
      lvl = threshold.lvl || index + 1;
    }
  });

  return { color, lvl };
}

export function getMath(expression: string, dataFrame: DataFrameMap) {
  const variableRegex =
    /\$([А-Яа-яЁёA-Za-z0-9_]+)(?:\.([А-Яа-яЁёA-Za-z0-9_ -]+))?(?::(last|total|max|min|count|delta))?/g;

  return String(
    expression.replace(
      variableRegex,
      (_match: string, refId: string, subKey: string, calculationMethod: CalculationMethod = 'last') => {
        if (refId !== undefined) {
          refId = refId.trim();
          const metricData = dataFrame.get(refId);
          if (metricData) {
            let value = 0;
            if (subKey !== undefined) {
              subKey = subKey.trim();
              const subKeyValues = metricData.values.get(subKey);
              if (subKeyValues) {
                const numericValues: number[] = subKeyValues.values.map(Number);
                value = calculateValue(numericValues, calculationMethod);
              }
            } else {
              const firstValue = Array.from(metricData.values.values())[0];
              if (firstValue) {
                const numericValues: number[] = firstValue.values.map(Number);
                value = calculateValue(numericValues, calculationMethod);
              }
            }
            return value.toFixed(2);
          }
        }
        return '0';
      }
    )
  );
}

export function evaluateThresholdCondition(condition: string, dataFrame: DataFrameMap): boolean {
  let result = false;

  try {
    const now = new Date();
    const timezone = parseInt(condition.match(/timezone\s*=\s*(-?\d+)/)?.[1] || '3', 10);
    const hour = (now.getUTCHours() + timezone + 24) % 24;
    const sanitizedCondition = condition.replace(/timezone\s*=\s*(-?\d+),?/, '').trim();

    const metricsCondition = getMath(sanitizedCondition, dataFrame);

    result = new Function('hour', 'minute', 'day', `return ${metricsCondition}`)(
      hour,
      now.getUTCMinutes(),
      now.getUTCDay()
    );
  } catch (error) {
    result = false;
  }

  return result;
}

export async function calculateExpressions(
  expressions: Expr[],
  dataFrame: DataFrameMap,
  timeRange: TimeRange
): Promise<DataFrameMap> {
  if (!expressions.length || !dataFrame) {
    return dataFrame;
  }

  const enrichedFrame: DataFrameMap = new Map(dataFrame);
  const meticTime = timeRange.to.valueOf();

  for (const expr of expressions) {
    if (!enrichedFrame.has(expr.refId) && expr.expression && expr.expression.trim() !== '') {
      const math = getMath(expr.expression, enrichedFrame);
      if (math && math.length > 0) {
        try {
          const result = Function('"use strict";return (' + math + ')')();
          enrichedFrame.set(expr.refId, {
            values: new Map([[expr.refId, { values: [String(result)], timestamps: [meticTime] }]]),
          });
        } catch {}
      }
    }
  }

  return enrichedFrame;
}

export function checkFilter(text: string, filter: filter | undefined, header?: string): boolean {
  if (!filter) {
    return true;
  }

  const key = header || '';
  const inc = filter.include?.[key];
  const exc = filter.exclude?.[key];

  const matchesPattern = (value: string, patterns: string[] | undefined): boolean => {
    if (!patterns || patterns.length === 0) {
      return true;
    }
    return patterns.some((pattern) => matchPattern(pattern, value));
  };

  if (inc && !matchesPattern(text, filter.include[key])) {
    return false;
  }

  if (exc && matchesPattern(text, filter.exclude[key])) {
    return false;
  }

  return true;
}

/**
 *  LEGACY-------------------------------------------------
 */
export function processLegacyMetric(metric: any): Metrics {
  if (!metric.refIds && !metric.legends) {
    return metric;
  }

  const newMetric = { ...metric };
  const queries: any[] = [];

  if (metric.refIds && Array.isArray(metric.refIds)) {
    metric.refIds.forEach((item: any) => {
      if (item && item.refid) {
        queries.push({ ...item });
      }
    });
  }

  if (metric.legends && Array.isArray(metric.legends)) {
    metric.legends.forEach((item: any) => {
      if (item && item.legend) {
        queries.push({ ...item });
      }
    });
  }

  if (queries.length > 0) {
    newMetric.queries = queries;
  }

  delete (newMetric as any).refIds;
  delete (newMetric as any).legends;

  return newMetric;
}
