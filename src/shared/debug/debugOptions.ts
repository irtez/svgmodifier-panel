export interface DebugOptions {
  /** Полностью отключает/включает весь вывод logger'а плагина */
  loggingEnabled: boolean;
  /** Уровень подробности, если loggingEnabled=true */
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  /** Показывать баннер с ошибками конфигурации прямо на панели (независимо от логов) */
  showErrorBanner: boolean;
  /** Отдельный тумблер для notifyTooltip — сейчас он "неоптимально написан", часто не нужен в проде */
  enableNotifyTooltip: boolean;
}

export const DEFAULT_DEBUG_OPTIONS: DebugOptions = {
  loggingEnabled: true,
  logLevel: 'warn',
  showErrorBanner: true,
  enableNotifyTooltip: false,
};
