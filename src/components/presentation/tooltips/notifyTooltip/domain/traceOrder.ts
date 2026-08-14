// domain/traceOrder.ts
//
// парсинг JSON и сортировка по индексу порядка. Имя файла изменено с
// "groupTraceData" (называет одну внутреннюю функцию) на "traceOrder"
// (называет назначение модуля: построение и применение порядка трейсов).
//
// Назначение: JSON задаёт ПОРЯДОК для уже отображаемых datasource-имён в notifyTooltip.
//
// Сопоставление имён — двухуровневое, и keyFn может вернуть НЕСКОЛЬКО кандидатов
// (например, имя с префиксом и без) — они проверяются по очереди:
//  1) точное совпадение (trim + lowercase) — быстрый путь;
//  2) если точного совпадения нет ни для одного кандидата — строки из JSON
//     трактуются как regex-паттерны (case-insensitive) и матчатся против каждого
//     кандидата. Невалидные как regex строки просто пропускаются.
//
// Защита от невалидных данных: при любой ошибке парсинга/формата функции возвращают
// пустой результат. sortByOrder при пустом индексе отдаёт исходный массив без
// изменений — тултип показывает список как есть, без сортировки и без падений.
//
// Поддерживает два формата входа:
//  1) "сырой" — объект, где каждый ключ — массив { trace_id, name, children_call? };
//  2) уже сгруппированный — массив [{ trace_id, data: string[] }].

import { logger } from 'shared/logger/logger';

export interface TraceEntry {
  trace_id: string;
  name?: string | string[];
  children_call?: string | string[];
  [key: string]: unknown;
}

export type RawTraceJson = Record<string, unknown>;

export interface TraceGroup {
  trace_id: string;
  data: string[];
}

export interface OrderIndex {
  /** normalizeKey(имя) -> позиция, точное совпадение */
  exact: Map<string, number>;
  /** скомпилированные regex-паттерны из JSON для нечёткого совпадения, по порядку */
  patterns: Array<{ regex: RegExp; pos: number }>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toList(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  return typeof value === 'string' ? [value] : [];
}

function normalizeKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Пытается скомпилировать строку как regex. Невалидные паттерны -> null (безопасно). */
function compileRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return null;
  }
}

function groupRawTraceData(raw: RawTraceJson): TraceGroup[] {
  const namesByTrace = new Map<string, string[]>();
  const childrenByTrace = new Map<string, string[]>();
  const order: string[] = [];

  for (const key of Object.keys(raw)) {
    const entries = raw[key];
    if (!Array.isArray(entries)) {
      continue;
    }

    for (const entry of entries) {
      if (!isPlainObject(entry)) {
        continue;
      }
      const rawTraceId = entry.trace_id;
      if (rawTraceId === undefined || rawTraceId === null || rawTraceId === '') {
        continue;
      }

      const traceId = String(rawTraceId);

      if (!namesByTrace.has(traceId)) {
        namesByTrace.set(traceId, []);
        childrenByTrace.set(traceId, []);
        order.push(traceId);
      }

      namesByTrace.get(traceId)!.push(...toList(entry.name));
      childrenByTrace.get(traceId)!.push(...toList(entry.children_call));
    }
  }

  return order.map((traceId) => ({
    trace_id: traceId,
    data: [...(namesByTrace.get(traceId) ?? []), ...(childrenByTrace.get(traceId) ?? [])],
  }));
}

function normalizeGroupedTraceData(grouped: unknown[]): TraceGroup[] {
  const result: TraceGroup[] = [];

  for (const g of grouped) {
    if (!isPlainObject(g)) {
      continue;
    }
    const rawTraceId = g.trace_id;
    if (rawTraceId === undefined || rawTraceId === null || rawTraceId === '') {
      continue;
    }
    result.push({ trace_id: String(rawTraceId), data: toList(g.data) });
  }

  return result;
}

function parseTraceGroups(raw?: string): TraceGroup[] {
  if (!raw || !raw.trim()) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    logger.warn('Невалидный JSON в impactJson, показываю список без сортировки', err, 'data');
    return [];
  }

  try {
    if (Array.isArray(parsed)) {
      return normalizeGroupedTraceData(parsed);
    }
    if (isPlainObject(parsed)) {
      return groupRawTraceData(parsed);
    }
    return [];
  } catch (err) {
    logger.warn('Не удалось разобрать структуру impactJson, показываю список без сортировки', err, 'data');
    return [];
  }
}

/**
 * Строит индекс порядка (точные ключи + regex-паттерны) из вставленного JSON.
 * При любой проблеме возвращает пустой индекс — безопасный fallback "показать как есть".
 */
export function buildOrderIndex(raw?: string): OrderIndex {
  try {
    const groups = parseTraceGroups(raw);
    const exact = new Map<string, number>();
    const patterns: Array<{ regex: RegExp; pos: number }> = [];
    let i = 0;

    for (const group of groups) {
      for (const name of group.data) {
        if (typeof name !== 'string' || !name.trim()) {
          continue;
        }

        const key = normalizeKey(name);
        if (!exact.has(key)) {
          exact.set(key, i);
        }

        const regex = compileRegex(name);
        if (regex) {
          patterns.push({ regex, pos: i });
        }

        i++;
      }
    }

    return { exact, patterns };
  } catch (err) {
    logger.warn('Ошибка построения индекса порядка notifyTooltip, сортировка отключена', err, 'data');
    return { exact: new Map(), patterns: [] };
  }
}

function toCandidateList(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

/**
 * Сортирует произвольный массив элементов по индексу порядка.
 *
 * keyFn может вернуть ОДНУ строку или МАССИВ кандидатов (например, имя с префиксом
 * и без) — они проверяются по очереди, первое совпадение выигрывает:
 * 1) точное совпадение среди всех кандидатов;
 * 2) если не найдено — проверка по regex-паттернам из JSON среди всех кандидатов;
 * 3) если не найдено ничего — элемент уходит в конец, сохраняя исходный порядок.
 *
 * Если индекс полностью пуст — возвращает items без изменений.
 */
export function sortByOrder<T>(items: T[], orderIndex: OrderIndex, keyFn: (item: T) => string | string[]): T[] {
  if (orderIndex.exact.size === 0 && orderIndex.patterns.length === 0) {
    return items;
  }

  try {
    const known: Array<{ item: T; pos: number }> = [];
    const unknown: T[] = [];

    for (const item of items) {
      const candidates = toCandidateList(keyFn(item));
      let pos: number | undefined;

      for (const candidate of candidates) {
        pos = orderIndex.exact.get(normalizeKey(candidate));
        if (pos !== undefined) {
          break;
        }
      }

      if (pos === undefined) {
        for (const candidate of candidates) {
          const match = orderIndex.patterns.find(({ regex }) => regex.test(candidate));
          if (match) {
            pos = match.pos;
            break;
          }
        }
      }

      if (pos !== undefined) {
        known.push({ item, pos });
      } else {
        unknown.push(item);
      }
    }

    known.sort((a, b) => a.pos - b.pos);

    return [...known.map((k) => k.item), ...unknown];
  } catch (err) {
    logger.warn('Ошибка сортировки notifyTooltip, показываю список без изменений', err, 'data');
    return items;
  }
}

/** Нормализует имя datasource: убирает префикс вида "C12" / "CA345" и лишние пробелы */
export function normalizeDsName(name: string): string {
  if (!name) {
    return '';
  }
  let s = name.trim();
  const prefixMatch = s.match(/^(C[A-Z]?\d+)/i);
  if (prefixMatch) {
    s = s.slice(prefixMatch[0].length).trim();
  }
  return s.replace(/\s+/g, ' ');
}

// --- Кэш скомпилированных wildcard-паттернов для excludeFilter --------------
// Перенесено сюда из useNotificationData.ts: это тоже чистая доменная логика
// (сопоставление строк по маске), не связанная с React.
const wildcardRegexCache = new Map<string, RegExp>();

function getWildcardRegex(pattern: string): RegExp {
  let regex = wildcardRegexCache.get(pattern);
  if (!regex) {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    regex = new RegExp('^' + escaped + '$', 'i');
    wildcardRegexCache.set(pattern, regex);
  }
  return regex;
}

export function wildcardMatch(pattern: string, text: string): boolean {
  return getWildcardRegex(pattern).test(text);
}
