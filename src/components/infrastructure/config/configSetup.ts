import { applySchema, parseFilter } from './parsers';
import { RegexCheck } from 'components/domain/utils/common';
import { processLegacyMetric } from 'components/domain/utils/calculations';
import { ConfigRules, QueryType, RulesByElementId, filter } from 'components/domain/models';

export interface PreparedPanelConfig {
  rulesByElementId: RulesByElementId;
  elementsById: Map<string, SVGElement>;
}

export function initializeConfig(svg: Document | null, config: ConfigRules[] | null): PreparedPanelConfig {
  const rulesByElementId: RulesByElementId = new Map();
  const elementsById = new Map<string, SVGElement>();

  const requireElement = svg !== null;

  if (svg) {
    const elements = svg.querySelectorAll<SVGElement>('[id^="cell"]');
    for (const el of elements) {
      el.id && elementsById.set(el.id, el);
    }
  }

  if (config) {
    prepareConfig(config, elementsById, rulesByElementId, requireElement);
  }

  return { rulesByElementId, elementsById };
}

function prepareConfig(
  rules: ConfigRules[],
  elementsById: Map<string, SVGElement>,
  rulesByElementId: RulesByElementId,
  requireElement: boolean
) {
  const getRuleConfig = (rule: ConfigRules) => {
    const config = rule.attributes;
    const elements = getElementsByIdOrRegex(rule.id, elementsById, requireElement);

    let elemsLength = elements.length;
    let currentIndex = 0;

    if (config.autoConfig) {
      elemsLength = elements.filter(([, , selector]) => selector.length === 0).length;
    }

    elements.forEach((el, index) => {
      const [id, schema, selector] = el;
      let configToUse = { ...config };
      let metrics = configToUse.metrics || undefined;

      if (Array.isArray(config.link) && config.link[index] !== undefined) {
        configToUse.link = config.link[index];
      }

      if (metrics) {
        const metricsArray = Array.isArray(metrics) ? metrics : [metrics];
        configToUse.metrics = metricsArray.map(processLegacyMetric);
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
        selector: selector,
        elemIndex: currentIndex,
        elemsLength: selector.length !== 0 ? 1 : elemsLength,
      };

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
  requireElement: boolean
): Array<[string, string, number[]]> {
  const getElement = (currentId: string): Array<[string, string, number[]]> => {
    const parsed = idParser(currentId);
    if (!parsed) {
      return [];
    }
    const [id, schema, selector] = parsed;

    const checkId = id && !id.startsWith('cell-') ? `cell-${id}` : id;

    if (!RegexCheck(checkId)) {
      const element = map.get(checkId);

      if (!element) {
        return requireElement ? [] : [[checkId, schema, selector]];
      }
      return [[checkId, schema, selector]];
    }

    const regex = new RegExp(checkId);

    const matches: Array<[string, string, number[]]> = Array.from(map.entries())
      .filter(([key]) => regex.test(key))
      .map(([key]) => [key, schema, selector]);

    if (matches.length === 0 && !requireElement) {
      return [[checkId, schema, selector]];
    }

    return matches;
  };

  if (Array.isArray(id)) {
    return id.flatMap((currentId) => getElement(currentId));
  }

  return getElement(id);
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
  return [id, schema, parsedSelector];
}

function selectorParser(s: string) {
  const cleanStr = s.startsWith('@') ? s.substring(1) : s;
  const result = [];

  for (const p of cleanStr.split(',')) {
    const trimmed = p.trim();
    if (!trimmed) {
      continue;
    }

    const [a, b] = trimmed.split('-').map(Number);

    if (b === undefined) {
      if (!isNaN(a)) {
        result.push(a);
      }
    } else if (!isNaN(a) && !isNaN(b)) {
      const step = a <= b ? 1 : -1;
      for (let i = a; step > 0 ? i <= b : i >= b; i += step) {
        result.push(i);
      }
    }
  }

  return result;
}
