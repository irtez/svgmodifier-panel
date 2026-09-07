import { Expr } from 'types';
import { TimeRange } from '@grafana/data';
import { DataFrameMap, Diagnostic, EvaluationContext } from '../models';
import { CalculationError, numericValue, reportCalculationError, reportDiagnostic } from './diagnostics';
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
    throw new CalculationError('EMPTY_INPUT', 'Нет значений для расчёта');
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

  if (!Number.isFinite(result)) {
    throw new CalculationError('NON_FINITE_VALUE', 'Расчёт не вернул конечное число');
  }
  return result;
}

export function getMetricColor(
  value: number,
  dataFrame: DataFrameMap,
  thresholds?: Threshold[],
  baseColor?: string,
  context: EvaluationContext = { timeTo: Date.now(), diagnostics: [] }
) {
  let lvl = 0;
  let color = baseColor;

  thresholds?.forEach((threshold, index) => {
    const thresholdContext = { ...context, source: { ...context.source, thresholdIndex: index } };
    if (!threshold || !Number.isFinite(threshold.value) || (threshold.lvl != null && !Number.isFinite(threshold.lvl))) {
      reportDiagnostic(
        thresholdContext,
        'INVALID_THRESHOLD',
        'Порог должен содержать числовую границу и числовой уровень'
      );
      return;
    }
    if (threshold.operator && !['<', '>', '<=', '>=', '=', '!='].includes(threshold.operator)) {
      reportDiagnostic(thresholdContext, 'INVALID_THRESHOLD', 'Неизвестный оператор сравнения порога');
      return;
    }
    if (threshold.condition && !evaluateThresholdCondition(threshold.condition, dataFrame, thresholdContext)) {
      return;
    }

    const comparisonResult = compareValues(value, threshold.value, threshold.operator || '>=');

    if (comparisonResult) {
      color = threshold.color;
      lvl = threshold.lvl ?? index + 1;
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
        refId = refId.trim();
        const metricData = dataFrame.get(refId);
        const selected =
          subKey === undefined ? metricData?.values.values().next().value : metricData?.values.get(subKey.trim());
        if (!selected) {
          throw new CalculationError('MISSING_INPUT', `Нет данных для ${refId}${subKey ? `.${subKey.trim()}` : ''}`, {
            refId,
            legend: subKey?.trim(),
          });
        }
        const value = calculateValue(selected.values.map(numericValue), calculationMethod);
        // Скобки сохраняют смысл отрицательных значений; округление относится только к UI.
        return `(${value})`;
      }
    )
  );
}

export function evaluateThresholdCondition(
  condition: string,
  dataFrame: DataFrameMap,
  context: EvaluationContext = { timeTo: Date.now(), diagnostics: [] }
): boolean {
  try {
    const timezone = parseInt(condition.match(/timezone\s*=\s*(-?\d+)/)?.[1] || '3', 10);
    const localTime = new Date(context.timeTo + timezone * 60 * 60 * 1000);
    const sanitizedCondition = condition.replace(/timezone\s*=\s*(-?\d+),?/, '').trim();

    const metricsCondition = getMath(sanitizedCondition, dataFrame);

    const result = new Function('hour', 'minute', 'day', `return ${metricsCondition}`)(
      localTime.getUTCHours(),
      localTime.getUTCMinutes(),
      localTime.getUTCDay()
    );
    if (typeof result !== 'boolean') {
      throw new Error('Ожидалось логическое значение true или false');
    }
    return result;
  } catch (error) {
    reportDiagnostic(
      context,
      'INVALID_CONDITION',
      `Не удалось проверить условие: ${error instanceof Error ? error.message : 'ошибка выражения'}`,
      error instanceof CalculationError ? error.source : undefined
    );
    return false;
  }
}

export async function calculateExpressions(
  expressions: Expr[],
  dataFrame: DataFrameMap,
  timeRange: TimeRange,
  diagnostics: Diagnostic[] = []
): Promise<DataFrameMap> {
  if (!expressions.length || !dataFrame) {
    return dataFrame;
  }

  const enrichedFrame: DataFrameMap = new Map(dataFrame);
  const meticTime = timeRange.to.valueOf();

  for (const expr of expressions) {
    if (!enrichedFrame.has(expr.refId) && expr.expression && expr.expression.trim() !== '') {
      try {
        const math = getMath(expr.expression, enrichedFrame);
        if (math && math.length > 0) {
          const result = Function('"use strict";return (' + math + ')')();
          if (typeof result !== 'number' || !Number.isFinite(result)) {
            throw new CalculationError('NON_FINITE_VALUE', 'Формула не вернула конечное число');
          }
          enrichedFrame.set(expr.refId, {
            values: new Map([[expr.refId, { values: [String(result)], timestamps: [meticTime] }]]),
          });
        }
      } catch (error) {
        reportCalculationError({ timeTo: meticTime, diagnostics, source: { expressionRefId: expr.refId } }, error);
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
