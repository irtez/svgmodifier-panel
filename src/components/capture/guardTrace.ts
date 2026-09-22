import { FieldSources } from './fieldSources';
import { EvaluationTrace, QueryTrace, RuleTrace } from './trace';

/** Ошибка recorder отключает только capture: UI продолжает единственный проход вычислений. */
export function guardTrace(trace: EvaluationTrace, onFailure: () => void): EvaluationTrace {
  const guarded = new WeakSet<object>();
  let disabled = false;
  const fail = () => {
    if (disabled) {
      return;
    }
    disabled = true;
    try {
      onFailure();
    } catch {
      // Даже отказ callback не должен менять результат обычного расчёта.
    }
  };

  const guard = (value: unknown): unknown => {
    const prototypes =
      value instanceof EvaluationTrace
        ? [EvaluationTrace.prototype, FieldSources.prototype]
        : value instanceof FieldSources
        ? [FieldSources.prototype]
        : value instanceof RuleTrace
        ? [RuleTrace.prototype]
        : value instanceof QueryTrace
        ? [QueryTrace.prototype]
        : [];
    if (!prototypes.length || guarded.has(value as object)) {
      return value;
    }
    const recorder = value as object;
    guarded.add(recorder);
    const methods = new Set<string>();
    for (const prototype of prototypes) {
      for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(prototype))) {
        if (name === 'constructor' || typeof descriptor.value !== 'function' || methods.has(name)) {
          continue;
        }
        methods.add(name);
        const method = Object.getOwnPropertyDescriptor(recorder, name)?.value ?? descriptor.value;
        Object.defineProperty(recorder, name, {
          configurable: true,
          writable: true,
          value: (...args: unknown[]) => {
            if (disabled) {
              return undefined;
            }
            try {
              // Исходный this сохраняет private state и identity; данные не оборачиваются в Proxy.
              const result: unknown = method.apply(recorder, args);
              return disabled ? undefined : guard(result);
            } catch {
              fail();
              return undefined;
            }
          },
        });
      }
    }
    return value;
  };

  guard(trace);
  return trace;
}
