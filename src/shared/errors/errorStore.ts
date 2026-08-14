// Глобальный (per-panel-instance) реестр ошибок, который презентационный слой
// может показать пользователю вместо console.error/console.warn "в никуда".
// Используем React 18 useSyncExternalStore — без лишних зависимостей.

import { useSyncExternalStore } from 'react';
import { AppError } from './AppError';
import { logger } from '../logger/logger';

export interface PanelErrorEntry {
  id: string;
  error: AppError;
  timestamp: number;
}

type Listener = () => void;

class ErrorStore {
  private entries: PanelErrorEntry[] = [];
  private listeners = new Set<Listener>();
  private idCounter = 0;

  report(error: AppError): void {
    // Всегда логируем через logger (уважает флаг enabled), но ошибка ВСЕГДА попадает в стор,
    // чтобы её можно было показать в UI даже при выключенном логировании.
    logger.error(error.message, { kind: error.kind, context: error.context, cause: error.cause }, 'config');

    const entry: PanelErrorEntry = {
      id: `err_${++this.idCounter}`,
      error,
      timestamp: Date.now(),
    };

    // Держим только последние 5 ошибок, чтобы не разрастаться в памяти при постоянно битом конфиге.
    this.entries = [entry, ...this.entries].slice(0, 5);
    this.emit();
  }

  dismiss(id: string): void {
    this.entries = this.entries.filter((e) => e.id !== id);
    this.emit();
  }

  clear(): void {
    this.entries = [];
    this.emit();
  }

  getSnapshot = (): PanelErrorEntry[] => this.entries;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit(): void {
    this.listeners.forEach((l) => l());
  }
}

// Единый инстанс на модуль. Если у панели несколько экземпляров на дашборде —
// ошибки будут общими на уровне JS-модуля панели, что для баннера приемлемо,
// т.к. отображается локально через компонент, привязанный к конкретному Provider.
export const errorStore = new ErrorStore();

export function useErrorStore(): PanelErrorEntry[] {
  return useSyncExternalStore(errorStore.subscribe, errorStore.getSnapshot, errorStore.getSnapshot);
}
