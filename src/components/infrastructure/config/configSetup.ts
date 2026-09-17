import { applySchema, parseFilter } from './parsers';
import type { EvaluationTrace } from 'components/capture/trace';
import { RegexCheck } from 'components/domain/utils/common';
import { processLegacyMetric } from 'components/domain/utils/calculations';
import {
  ConfigRules,
  Diagnostic,
  DiagnosticSource,
  QueryType,
  RulesByElementId,
  filter,
} from 'components/domain/models';

const isRecord = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export interface PreparedPanelConfig {
  rulesByElementId: RulesByElementId;
  elementsById: Map<string, SVGElement>;
  diagnostics?: Diagnostic[];
}

export function initializeConfig(
  svg: Document | null,
  config: ConfigRules[] | null,
  capture?: EvaluationTrace
): PreparedPanelConfig {
  const rulesByElementId: RulesByElementId = new Map();
  const elementsById = new Map<string, SVGElement>();
  const diagnostics: Diagnostic[] = [];

  const requireElement = svg !== null;

  if (svg) {
    const elements = svg.querySelectorAll<SVGElement>('[id^="cell"]');
    for (const el of elements) {
      el.id && elementsById.set(el.id, el);
    }
  }

  if (config) {
    prepareConfig(config, elementsById, rulesByElementId, requireElement, diagnostics, capture);
  }

  return { rulesByElementId, elementsById, diagnostics };
}

function prepareConfig(
  rules: ConfigRules[],
  elementsById: Map<string, SVGElement>,
  rulesByElementId: RulesByElementId,
  requireElement: boolean,
  diagnostics: Diagnostic[],
  capture?: EvaluationTrace
) {
  const getRuleConfig = (rule: ConfigRules) => {
    const config = rule.attributes;
    const elements = getElementsByIdOrRegex(rule.id, elementsById, requireElement, rule.source, diagnostics);

    let elemsLength = elements.length;
    let currentIndex = 0;

    if (config.autoConfig) {
      elemsLength = elements.filter(([, , selector]) => selector.length === 0).length;
    }

    elements.forEach((el, index) => {
      const [id, schema, selector] = el;
      let configToUse = { ...config };
      const metrics = configToUse.metrics;

      if (Array.isArray(config.link) && config.link[index] !== undefined) {
        configToUse.link = config.link[index];
      }

      if (metrics !== undefined) {
        const metricsArray = Array.isArray(metrics) ? metrics : isRecord(metrics) ? [metrics] : [];
        if (!Array.isArray(metrics) && !isRecord(metrics)) {
          diagnostics.push({
            code: 'INVALID_METRICS',
            severity: 'warning',
            message: 'attributes.metrics должен быть объектом или массивом объектов',
            source: rule.source,
          });
        }
        configToUse.metrics = metricsArray.flatMap((metric) => {
          if (!isRecord(metric)) {
            diagnostics.push({
              code: 'INVALID_METRIC',
              severity: 'warning',
              message: 'Настройка metric должна быть объектом',
              source: rule.source,
            });
            return [];
          }
          const legacy = processLegacyMetric(metric);
          const queries = sanitizeQueries(legacy.queries, rule.source, diagnostics);
          const thresholds = sanitizeThresholds(legacy.thresholds, rule.source, diagnostics);
          return {
            ...legacy,
            queries,
            thresholds,
          };
        });
      }

      if (schema && schema.length > 0) {
        configToUse = applySchema(configToUse, schema);
      }

      if (configToUse.metrics) {
        for (const metric of configToUse.metrics) {
          if (metric.queries && Array.isArray(metric.queries)) {
            metric.queries = metric.queries.map((q: QueryType) => {
              const newQ: any = { ...q };

              if (typeof newQ.filter === 'string' && newQ.filter.trim()) {
                newQ.filter = parseFilter(newQ.filter) as filter | undefined;
              }

              return newQ;
            });
          }
        }
      }

      const preparedRule = {
        attributes: configToUse,
        source: rule.source,
        selector: selector,
        elemIndex: currentIndex,
        elemsLength: selector.length !== 0 ? 1 : elemsLength,
      };
      capture?.preparedRule(rule, preparedRule, id);

      if (selector.length === 0) {
        currentIndex++;
      }

      if (rulesByElementId.has(id)) {
        rulesByElementId.get(id)!.push(preparedRule);
      } else {
        rulesByElementId.set(id, [preparedRule]);
      }
    });
  };

  for (const rule of rules) {
    if (!rule.id || !rule.attributes) {
      continue;
    }

    getRuleConfig(rule);
  }
}

function getElementsByIdOrRegex(
  id: string | string[],
  map: Map<string, SVGElement>,
  requireElement: boolean,
  source: DiagnosticSource | undefined,
  diagnostics: Diagnostic[]
): Array<[string, string, number[]]> {
  const getElement = (currentId: string): Array<[string, string, number[]]> => {
    const parsed = idParser(currentId);
    if (!parsed) {
      diagnostics.push({
        code: 'INVALID_SELECTOR',
        severity: 'warning',
        message: `Некорректный selector в "${currentId}"`,
        source,
      });
      return [];
    }
    const [id, schema, selector] = parsed;

    const checkId = id && !id.startsWith('cell-') ? `cell-${id}` : id;

    if (!RegexCheck(checkId)) {
      const element = map.get(checkId);

      if (!element) {
        if (requireElement) {
          diagnostics.push({
            code: 'MISSING_ELEMENT',
            severity: 'error',
            message: `SVG-элемент "${checkId}" не найден`,
            source,
          });
        }
        return requireElement ? [] : [[checkId, schema, selector]];
      }
      return [[checkId, schema, selector]];
    }

    let regex: RegExp;
    try {
      regex = new RegExp(checkId);
    } catch {
      diagnostics.push({
        code: 'INVALID_PATTERN',
        severity: 'error',
        message: `Некорректное регулярное выражение "${checkId}"`,
        source,
      });
      return [];
    }

    const matches: Array<[string, string, number[]]> = Array.from(map.entries())
      .filter(([key]) => regex.test(key))
      .map(([key]) => [key, schema, selector]);

    if (matches.length === 0 && !requireElement) {
      return [[checkId, schema, selector]];
    }

    if (matches.length === 0) {
      diagnostics.push({
        code: 'UNMATCHED_PATTERN',
        severity: 'warning',
        message: `Регулярное выражение "${checkId}" не нашло SVG-элементов`,
        source,
      });
    }

    return matches;
  };

  if (Array.isArray(id)) {
    return id.flatMap((currentId) => getElement(currentId));
  }

  return getElement(id);
}

/** Оставляет только безопасные query-объекты, чтобы конфиг не валил подготовку панели. */
function sanitizeQueries(
  queries: unknown,
  source: DiagnosticSource | undefined,
  diagnostics: Diagnostic[]
): QueryType[] | undefined {
  if (queries === undefined) {
    return undefined;
  }
  if (!Array.isArray(queries)) {
    diagnostics.push({
      code: 'INVALID_QUERIES',
      severity: 'warning',
      message: 'metrics.queries должен быть массивом',
      source,
    });
    return undefined;
  }
  return queries.flatMap((query) => {
    if (!isRecord(query)) {
      diagnostics.push({
        code: 'INVALID_QUERY',
        severity: 'warning',
        message: 'Запрос metric должен быть объектом',
        source,
      });
      return [];
    }
    return [{ ...query } as QueryType];
  });
}

function sanitizeThresholds(
  thresholds: unknown,
  source: DiagnosticSource | undefined,
  diagnostics: Diagnostic[]
): any[] | undefined {
  if (thresholds === undefined) {
    return undefined;
  }
  if (!Array.isArray(thresholds)) {
    diagnostics.push({
      code: 'INVALID_THRESHOLDS',
      severity: 'warning',
      message: 'thresholds должен быть массивом',
      source,
    });
    return undefined;
  }
  return thresholds.flatMap((threshold) => {
    if (!isRecord(threshold)) {
      diagnostics.push({
        code: 'INVALID_THRESHOLD',
        severity: 'warning',
        message: 'Порог должен быть объектом',
        source,
      });
      return [];
    }
    return [{ ...threshold }];
  });
}

function idParser(raw: string): [id: string, schema: string, selector: number[]] | null {
  const input = String(raw ?? '').trim();
  if (!input) {
    return null;
  }

  if (!input.includes(':')) {
    return [input, '', []];
  }

  const items = input.split(':');
  const id = items[0];
  let schema = '';
  let selector = '';

  const isSelector = (item: string) => item?.[0] === '@' || (item?.[0] >= '0' && item?.[0] <= '9');

  if (items.length >= 2) {
    const a = items[1];
    const b = items[2];
    if (isSelector(a)) {
      selector = a;
      schema = b;
    } else if (isSelector(b)) {
      selector = b;
      schema = a;
    } else {
      schema = a;
    }
  }

  const parsedSelector = selector ? selectorParser(selector) : [];
  if (parsedSelector === null) {
    return null;
  }
  return [id, schema, parsedSelector];
}

function selectorParser(s: string): number[] | null {
  const cleanStr = s.startsWith('@') ? s.substring(1) : s;
  const result = [];
  const maximumItems = 10000;

  if (!cleanStr.trim()) {
    return null;
  }

  for (const p of cleanStr.split(',')) {
    const trimmed = p.trim();
    if (!trimmed) {
      return null;
    }

    const parts = trimmed.split('-');
    if (parts.length > 2) {
      return null;
    }
    const [a, b] = parts.map(Number);
    const validIndex = (value: number) => Number.isSafeInteger(value) && value > 0;

    if (b === undefined) {
      if (!validIndex(a) || result.length >= maximumItems) {
        return null;
      }
      result.push(a);
    } else if (validIndex(a) && validIndex(b)) {
      const count = Math.abs(a - b) + 1;
      if (count > maximumItems || result.length + count > maximumItems) {
        return null;
      }
      const step = a <= b ? 1 : -1;
      for (let i = a; step > 0 ? i <= b : i >= b; i += step) {
        result.push(i);
      }
    } else {
      return null;
    }
  }

  return result;
}
