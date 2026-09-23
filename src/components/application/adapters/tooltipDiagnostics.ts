import type { Diagnostic } from 'components/domain/models';
import { isNoDataDiagnostic } from 'components/domain/utils/diagnostics';

/** Сокращает только UI-представление; evaluation и снимок сохраняют все сообщения. */
export function tooltipDiagnostics(diagnostics: Diagnostic[], hideNoDataWarnings = false): Diagnostic[] {
  const unique = new Map<string, Diagnostic>();
  const add = (item: Diagnostic, ancestors: Set<Diagnostic>) => {
    if (isNoDataDiagnostic(item) && item.causes?.length && !ancestors.has(item)) {
      const next = new Set(ancestors).add(item);
      item.causes.forEach((cause) => add(cause, next));
      return;
    }
    if (hideNoDataWarnings && isNoDataDiagnostic(item)) {
      return;
    }
    const key = JSON.stringify([item.code, item.severity, item.message, item.source]);
    if (!unique.has(key)) {
      unique.set(key, item);
    }
  };
  diagnostics.forEach((item) => add(item, new Set()));
  return [...unique.values()];
}
