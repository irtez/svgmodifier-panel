export interface DiagnosticSource {
  page?: string;
  pageIndex?: number;
  path?: string;
  line?: number;
  column?: number;
  refId?: string;
  legend?: string;
  expressionRefId?: string;
  thresholdIndex?: number;
}

export interface Diagnostic {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  source?: DiagnosticSource;
  elementIds?: string[];
}

/** Контекст одного расчёта; время и сообщения не разделяются между панелями. */
export interface EvaluationContext {
  timeTo: number;
  diagnostics: Diagnostic[];
  source?: DiagnosticSource;
  elementIds?: string[];
}
