import { Diagnostic, DiagnosticSource, EvaluationContext } from '../models/diagnosticModels';

export class CalculationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly source?: DiagnosticSource,
    public readonly causes?: Diagnostic[]
  ) {
    super(message);
    this.name = 'CalculationError';
  }
}

const NO_DATA_CODES = new Set(['MISSING_INPUT', 'EMPTY_INPUT', 'MISSING_VALUE']);

export const isNoDataDiagnostic = (diagnostic: Pick<Diagnostic, 'code'>): boolean => NO_DATA_CODES.has(diagnostic.code);

// Сопоставляем только уже известный отказ входа; пустой ответ не доказывает ошибку конфига.
export function inputFailures(refId: string, diagnostics: Diagnostic[] = []): Diagnostic[] {
  return diagnostics.filter((item) =>
    item.source?.expressionRefId
      ? item.source.expressionRefId === refId
      : item.code === 'QUERY_ERROR'
      ? !item.source?.refId || item.source.refId === refId
      : item.code === 'CALCULATION_ERROR' && !item.source?.refId
  );
}

export function reportDiagnostic(
  context: EvaluationContext | undefined,
  code: string,
  message: string,
  source?: DiagnosticSource,
  severity: Diagnostic['severity'] = isNoDataDiagnostic({ code }) ? 'warning' : 'error',
  causes?: Diagnostic[]
): void {
  context?.diagnostics.push({
    code,
    severity,
    message,
    source: { ...context.source, ...source },
    elementIds: context.elementIds,
    ...(causes?.length ? { causes } : {}),
  });
}

export function reportCalculationError(context: EvaluationContext | undefined, error: unknown): void {
  reportDiagnostic(
    context,
    error instanceof CalculationError ? error.code : 'CALCULATION_ERROR',
    error instanceof Error ? error.message : 'Не удалось выполнить расчёт',
    error instanceof CalculationError ? error.source : undefined,
    undefined,
    error instanceof CalculationError ? error.causes : undefined
  );
}

/** Пустые строки и null из datasource не являются числовым нулём. */
export function numericValue(value: unknown): number | null {
  if (value == null) {
    return null;
  }
  if (typeof value === 'boolean' || (typeof value === 'string' && !value.trim())) {
    return NaN;
  }
  return Number(value);
}
