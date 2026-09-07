import { Diagnostic, DiagnosticSource, EvaluationContext } from '../models/diagnosticModels';

export class CalculationError extends Error {
  constructor(public readonly code: string, message: string, public readonly source?: DiagnosticSource) {
    super(message);
    this.name = 'CalculationError';
  }
}

export function reportDiagnostic(
  context: EvaluationContext | undefined,
  code: string,
  message: string,
  source?: DiagnosticSource,
  severity: Diagnostic['severity'] = 'error'
): void {
  context?.diagnostics.push({
    code,
    severity,
    message,
    source: { ...context.source, ...source },
    elementIds: context.elementIds,
  });
}

export function reportCalculationError(context: EvaluationContext | undefined, error: unknown): void {
  reportDiagnostic(
    context,
    error instanceof CalculationError ? error.code : 'CALCULATION_ERROR',
    error instanceof Error ? error.message : 'Не удалось выполнить расчёт',
    error instanceof CalculationError ? error.source : undefined
  );
}

/** Пустые строки и null из datasource не являются числовым нулём. */
export function numericValue(value: unknown): number {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'boolean' ||
    (typeof value === 'string' && !value.trim())
  ) {
    return NaN;
  }
  return Number(value);
}
