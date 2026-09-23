import { Expr } from 'types';
import type { CheckTrace, ColorTrace, EvaluationTrace, InputTrace } from 'components/capture/trace';
import { TimeRange } from '@grafana/data';
import { DataFrameMap, Diagnostic, EvaluationContext } from '../models';
import {
  CalculationError,
  inputFailures,
  isNoDataDiagnostic,
  numericValue,
  reportCalculationError,
  reportDiagnostic,
} from './diagnostics';
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

export function calculateValue(
  values: Array<number | null>,
  method: CalculationMethod,
  capture?: { calculation: CalculationMethod | null }
): number {
  if (values.length === 0) {
    throw new CalculationError('EMPTY_INPUT', 'Нет значений для расчёта');
  }

  if (!['last', 'total', 'max', 'min', 'count', 'delta'].includes(method)) {
    method = 'last';
  }
  if (capture) {
    capture.calculation = method;
  }
  const required =
    method === 'count'
      ? []
      : method === 'last'
      ? [values[values.length - 1]]
      : method === 'delta'
      ? [values[0], values[values.length - 1]]
      : values;
  let missing = false;
  // Ошибка в используемых данных не скрывается, даже если рядом есть пропуск.
  for (const value of required) {
    if (value == null) {
      missing = true;
    } else if (!Number.isFinite(value)) {
      throw new CalculationError('NON_FINITE_VALUE', 'Расчёт не вернул конечное число');
    }
  }
  if (missing) {
    throw new CalculationError('MISSING_VALUE', 'Недостаточно данных для расчёта: есть пустые значения');
  }
  const numbers = values as number[];

  let result: number;
  switch (method) {
    case 'last':
      result = numbers[numbers.length - 1];
      break;
    case 'total':
      result = numbers.reduce((a, b) => a + b, 0);
      break;
    case 'max':
      result = Math.max(...numbers);
      break;
    case 'min':
      result = Math.min(...numbers);
      break;
    case 'count':
      result = values.length;
      break;
    case 'delta':
      result = numbers[numbers.length - 1] - numbers[0];
      break;
    default:
      method = 'last';
      result = numbers[numbers.length - 1];
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
  context: EvaluationContext = { timeTo: Date.now(), diagnostics: [] },
  capture?: ColorTrace
) {
  let lvl = 0;
  let color = baseColor;

  thresholds?.forEach((threshold, index) => {
    const thresholdContext = { ...context, source: { ...context.source, thresholdIndex: index } };
    const start = context.diagnostics.length;
    const check: CheckTrace | undefined = capture
      ? {
          index,
          condition: threshold?.condition ? 'not_evaluated' : 'not_present',
          comparison: 'not_evaluated',
          matched: false,
          inputs: [],
          diagnostics: [],
        }
      : undefined;
    try {
      if (
        !threshold ||
        !Number.isFinite(threshold.value) ||
        (threshold.lvl != null && !Number.isFinite(threshold.lvl))
      ) {
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
      if (threshold.condition && !evaluateThresholdCondition(threshold.condition, dataFrame, thresholdContext, check)) {
        return;
      }

      const comparisonResult = compareValues(value, threshold.value, threshold.operator || '>=');
      if (check) {
        check.comparison = comparisonResult ? 'true' : 'false';
        check.matched = comparisonResult;
      }

      if (comparisonResult) {
        color = threshold.color;
        lvl = threshold.lvl ?? index + 1;
        if (capture) {
          capture.selectedThresholdIndex = index;
        }
      }
    } finally {
      if (check && capture) {
        check.diagnostics = context.diagnostics.slice(start);
        capture.checks.push(check);
      }
    }
  });

  return { color, lvl };
}

const variableRegex =
  /\$([А-Яа-яЁёA-Za-z0-9_]+)(?:\.([А-Яа-яЁёA-Za-z0-9_ -]+))?(?::(last|total|max|min|count|delta))?/g;

// Проверяем только синтаксис при пропавшем входе, не выполняем формулу второй раз.
function preferSyntaxError(error: unknown, expression: string, condition = false): unknown {
  if (error instanceof CalculationError && isNoDataDiagnostic(error)) {
    try {
      const placeholder = expression.replace(variableRegex, '(0)');
      new Function(condition ? `return ${placeholder}` : `"use strict";return (${placeholder})`);
    } catch (syntaxError) {
      return syntaxError;
    }
  }
  return error;
}

export function getMath(
  expression: string,
  dataFrame: DataFrameMap,
  inputs?: InputTrace[],
  context?: EvaluationContext
) {
  const failures: CalculationError[] = [];
  const math = String(
    expression.replace(
      variableRegex,
      (_match: string, refId: string, subKey: string, calculationMethod: CalculationMethod = 'last') => {
        refId = refId.trim();
        const metricData = dataFrame.get(refId);
        const selected =
          subKey === undefined ? metricData?.values.values().next().value : metricData?.values.get(subKey.trim());
        const input = inputs
          ? {
              token: _match,
              refId,
              field: subKey?.trim() ?? metricData?.values.keys().next().value ?? null,
              calculation: calculationMethod,
              value: undefined as number | undefined,
            }
          : undefined;
        if (input) {
          inputs!.push(input);
        }
        if (!selected) {
          failures.push(
            new CalculationError(
              'MISSING_INPUT',
              `Нет данных для ${refId}${subKey ? `.${subKey.trim()}` : ''}`,
              {
                refId,
                legend: subKey?.trim(),
              },
              inputFailures(refId, context?.inputDiagnostics ?? context?.diagnostics)
            )
          );
          return '(0)';
        }
        let value: number;
        try {
          value = calculateValue(selected.values.map(numericValue), calculationMethod);
        } catch (error) {
          if (error instanceof CalculationError) {
            failures.push(
              new CalculationError(
                error.code,
                error.message,
                { ...error.source, refId, legend: subKey?.trim() },
                error.causes
              )
            );
            return '(0)';
          }
          throw error;
        }
        if (input) {
          input.value = value;
        }
        // Скобки сохраняют смысл отрицательных значений; округление относится только к UI.
        return `(${value})`;
      }
    )
  );
  if (failures.length === 1) {
    throw failures[0];
  }
  if (failures.length) {
    // Проверяем все входы, но не выполняем выражение с временными заглушками.
    // Каждая причина сохраняет собственный refId даже без потребителей формулы.
    const causes: Diagnostic[] = [];
    failures.forEach((error) =>
      reportCalculationError({ ...context, timeTo: context?.timeTo ?? 0, diagnostics: causes }, error)
    );
    context?.diagnostics.push(...causes);
    const primary = failures.find((error) => !isNoDataDiagnostic(error)) ?? failures[0];
    throw new CalculationError(primary.code, primary.message, primary.source, causes);
  }
  return math;
}

export function evaluateThresholdCondition(
  condition: string,
  dataFrame: DataFrameMap,
  context: EvaluationContext = { timeTo: Date.now(), diagnostics: [] },
  capture?: CheckTrace
): boolean {
  let sanitizedCondition = condition;
  try {
    sanitizedCondition = condition.replace(/timezone\s*=\s*(-?\d+),?/, '').trim();
    const timezone = parseInt(condition.match(/timezone\s*=\s*(-?\d+)/)?.[1] || '3', 10);
    const localTime = new Date(context.timeTo + timezone * 60 * 60 * 1000);

    const metricsCondition = getMath(sanitizedCondition, dataFrame, capture?.inputs, context);

    const result = new Function('hour', 'minute', 'day', `return ${metricsCondition}`)(
      localTime.getUTCHours(),
      localTime.getUTCMinutes(),
      localTime.getUTCDay()
    );
    if (typeof result !== 'boolean') {
      throw new Error('Ожидалось логическое значение true или false');
    }
    if (capture) {
      capture.condition = result ? 'true' : 'false';
    }
    return result;
  } catch (error) {
    if (capture) {
      capture.condition = 'error';
    }
    const reason = preferSyntaxError(error, sanitizedCondition, true);
    const noData = reason instanceof CalculationError && isNoDataDiagnostic(reason);
    reportDiagnostic(
      context,
      noData ? reason.code : 'INVALID_CONDITION',
      `${noData ? 'Недостаточно данных для условия' : 'Не удалось проверить условие'}: ${
        reason instanceof Error ? reason.message : 'ошибка выражения'
      }`,
      reason instanceof CalculationError ? reason.source : undefined,
      undefined,
      reason instanceof CalculationError ? reason.causes : undefined
    );
    return false;
  }
}

export async function calculateExpressions(
  expressions: Expr[],
  dataFrame: DataFrameMap,
  timeRange: TimeRange,
  diagnostics: Diagnostic[] = [],
  capture?: EvaluationTrace
): Promise<DataFrameMap> {
  if (!expressions.length || !dataFrame) {
    return dataFrame;
  }

  const enrichedFrame: DataFrameMap = new Map(dataFrame);
  const meticTime = timeRange.to.valueOf();

  for (const expr of expressions) {
    const expressionCapture = capture?.expression(expr);
    const diagnosticStart = diagnostics.length;
    const context = { timeTo: meticTime, diagnostics, source: { expressionRefId: expr.refId } };
    if (!enrichedFrame.has(expr.refId) && expr.expression && expr.expression.trim() !== '') {
      try {
        const math = getMath(expr.expression, enrichedFrame, expressionCapture?.inputs, context);
        if (math && math.length > 0) {
          const result = Function('"use strict";return (' + math + ')')();
          if (typeof result !== 'number' || !Number.isFinite(result)) {
            throw new CalculationError('NON_FINITE_VALUE', 'Формула не вернула конечное число');
          }
          enrichedFrame.set(expr.refId, {
            values: new Map([[expr.refId, { values: [String(result)], timestamps: [meticTime] }]]),
          });
          if (expressionCapture) {
            expressionCapture.value = result;
          }
        }
      } catch (error) {
        reportCalculationError(context, preferSyntaxError(error, expr.expression));
      }
    } else if (expressionCapture) {
      expressionCapture.skipped = enrichedFrame.has(expr.refId)
        ? 'Формула не выполнялась: refId уже существует'
        : 'Формула не выполнялась: пустое выражение';
    }
    if (expressionCapture) {
      expressionCapture.diagnostics = diagnostics.slice(diagnosticStart);
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
