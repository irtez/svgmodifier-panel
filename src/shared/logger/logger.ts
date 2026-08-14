export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

export type LogCategory =
  | 'config' // парсинг YAML, схемы, конфигурация правил
  | 'svg' // операции над SVG-документом
  | 'data' // extractFields, calculateExpressions, datasource
  | 'render' // React-хуки/панели
  | 'editor'; // YamlEditor, автодополнение

interface LoggerState {
  enabled: boolean;
  level: LogLevel;
  /** Если задано — логируем только эти категории. Пусто = все. */
  categories: Set<LogCategory> | null;
}

const state: LoggerState = {
  enabled: false, // по умолчанию логирование ВЫКЛЮЧЕНО (важно для прод-панелей)
  level: 'warn',
  categories: null,
};

/** Вызывается один раз в usePanelData/PanelProvider при каждом изменении options.debug */
export function configureLogger(config: { enabled: boolean; level: LogLevel; categories?: LogCategory[] }): void {
  state.enabled = config.enabled;
  state.level = config.level;
  state.categories = config.categories?.length ? new Set(config.categories) : null;
}

function shouldLog(level: LogLevel, category?: LogCategory): boolean {
  if (!state.enabled || level === 'silent') {
    return false;
  }
  if (LEVEL_WEIGHT[level] > LEVEL_WEIGHT[state.level]) {
    return false;
  }
  if (category && state.categories && !state.categories.has(category)) {
    return false;
  }
  return true;
}

function format(category: LogCategory | undefined, msg: string): string {
  return category ? `[svg-modifier:${category}] ${msg}` : `[svg-modifier] ${msg}`;
}

export const logger = {
  error(msg: string, meta?: unknown, category?: LogCategory): void {
    // Ошибки логируем даже если общий уровень выше, но респектируем enabled/categories,
    // ЗА ИСКЛЮЧЕНИЕМ критичных сбоев — их пробрасываем через errorStore, а не только в консоль.
    if (!shouldLog('error', category)) {
      return;
    }
    // eslint-disable-next-line no-console
    console.error(format(category, msg), meta ?? '');
  },
  warn(msg: string, meta?: unknown, category?: LogCategory): void {
    if (!shouldLog('warn', category)) {
      return;
    }
    // eslint-disable-next-line no-console
    console.warn(format(category, msg), meta ?? '');
  },
  info(msg: string, meta?: unknown, category?: LogCategory): void {
    if (!shouldLog('info', category)) {
      return;
    }
    // eslint-disable-next-line no-console
    console.info(format(category, msg), meta ?? '');
  },
  debug(msg: string, meta?: unknown, category?: LogCategory): void {
    if (!shouldLog('debug', category)) {
      return;
    }
    // eslint-disable-next-line no-console
    console.debug(format(category, msg), meta ?? '');
  },
};
