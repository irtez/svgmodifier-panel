import type { JsonValueV2 as JsonValue } from './modelsV2';
type JsonObject = Record<string, JsonValue>;

/** Не вызывает toJSON/getter и не превращает неподходящие значения в ноль. */
export function copyJson(value: unknown, issue: () => void, ancestors = new Set<object>()): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (!value || typeof value !== 'object' || ancestors.has(value) || ancestors.size >= 100) {
    issue();
    return null;
  }
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    issue();
    return null;
  }
  ancestors.add(value);
  let result: JsonValue;
  if (Array.isArray(value)) {
    result = Array.from({ length: value.length }, (_, i) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (!descriptor || !('value' in descriptor)) {
        issue();
        return null;
      }
      return copyJson(descriptor.value, issue, ancestors);
    });
  } else {
    const entries: JsonObject = Object.create(null);
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (!descriptor.enumerable) {
        continue;
      }
      if (!('value' in descriptor)) {
        issue();
        entries[key] = null;
      } else if (descriptor.value !== undefined) {
        entries[key] = copyJson(descriptor.value, issue, ancestors);
      }
    }
    result = entries;
  }
  ancestors.delete(value);
  return result;
}
