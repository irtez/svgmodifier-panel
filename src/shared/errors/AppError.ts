export type AppErrorKind = 'config' | 'svg' | 'data' | 'expression' | 'unknown';

export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly cause?: unknown;
  readonly context?: Record<string, unknown>;

  constructor(kind: AppErrorKind, message: string, options?: { cause?: unknown; context?: Record<string, unknown> }) {
    super(message);
    this.name = 'AppError';
    this.kind = kind;
    this.cause = options?.cause;
    this.context = options?.context;
  }
}

export class ConfigError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('config', message, { context });
    this.name = 'ConfigError';
  }
}

export class SvgError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('svg', message, { context });
    this.name = 'SvgError';
  }
}

export class ExpressionError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('expression', message, { context });
    this.name = 'ExpressionError';
  }
}
