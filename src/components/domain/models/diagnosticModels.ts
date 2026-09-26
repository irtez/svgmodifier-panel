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
  /** Подтверждённые причины в текущем расчёте; presentation их читает, не удаляет. */
  causes?: Diagnostic[];
}

/** Контекст одного расчёта; время и сообщения не разделяются между панелями. */
export interface EvaluationContext {
  timeTo: number;
  diagnostics: Diagnostic[];
  source?: DiagnosticSource;
  elementIds?: string[];
  inputDiagnostics?: Diagnostic[];
}
