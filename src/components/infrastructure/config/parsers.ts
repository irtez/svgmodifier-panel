import { ConfigRules, Diagnostic, DiagnosticSource, Metrics, filter } from 'components/domain/models';
import YAML from 'yaml';
import { CalculationError } from 'components/domain/utils/diagnostics';

export interface Page {
  page: string;
  code: string;
}

export type PanelConfigInput = Page[] | string | string[] | undefined;

export interface ParsedPanelConfig {
  rules: ConfigRules[];
  diagnostics: Diagnostic[];
  status: 'ready' | 'empty' | 'invalid';
}

interface InputPage extends Page {
  pageIndex: number;
  wrapperLine: number;
}

const CALCULATIONS = new Set(['last', 'total', 'max', 'min', 'count', 'delta']);
const OPERATORS = new Set(['=', '>', '<', '>=', '!=', '<=']);
const isRecord = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Parses page YAML while retaining enough origin information for actionable diagnostics. */
export function parsePanelConfig(input: PanelConfigInput): ParsedPanelConfig {
  const normalized = normalizeInput(input);
  if (!normalized.ok) {
    return { rules: [], status: 'invalid', diagnostics: [diagnostic('INVALID_INPUT', normalized.message, 'error')] };
  }
  if (normalized.pages.length === 0) {
    return { rules: [], diagnostics: [], status: 'empty' };
  }

  const pages = wrapPages(normalized.pages);
  const lineCounter = new YAML.LineCounter();
  const document = YAML.parseDocument(
    pages.map(({ code, pageIndex }) => `page_${pageIndex}:\n${indent(code)}`).join('\n'),
    {
      lineCounter,
    }
  );
  if (document.errors.length) {
    return {
      rules: [],
      status: 'invalid',
      diagnostics: document.errors.map((error) =>
        diagnostic('YAML_PARSE_ERROR', error.message, 'error', sourceForError(error, pages))
      ),
    };
  }

  let root: unknown;
  try {
    root = document.toJS({ maxAliasCount: 10000 });
  } catch (error) {
    return {
      rules: [],
      status: 'invalid',
      diagnostics: [
        diagnostic(
          'YAML_RESOLUTION_ERROR',
          `Не удалось разрешить YAML alias: ${error instanceof Error ? error.message : 'ошибка преобразования'}`,
          'error'
        ),
      ],
    };
  }
  if (!isRecord(root)) {
    return {
      rules: [],
      status: 'invalid',
      diagnostics: [diagnostic('INVALID_ROOT', 'YAML должен содержать объект верхнего уровня', 'error')],
    };
  }

  const diagnostics = document.warnings.map((warning) =>
    diagnostic('YAML_WARNING', warning.message, 'warning', sourceForError(warning, pages))
  );
  const rules: ConfigRules[] = [];
  let hasChangesBlock = false;
  for (const page of pages) {
    const pageData = root[`page_${page.pageIndex}`];
    if (!isRecord(pageData)) {
      diagnostics.push(
        diagnostic('INVALID_PAGE', 'Страница YAML должна содержать объект', 'warning', pageSource(page))
      );
      continue;
    }
    if (pageData.changes === undefined) {
      continue;
    }
    hasChangesBlock = true;
    if (!Array.isArray(pageData.changes)) {
      diagnostics.push(
        diagnostic('INVALID_CHANGES', '"changes" должен быть массивом правил', 'warning', pageSource(page))
      );
      continue;
    }

    const nodes = changesNodes(document.contents, page.pageIndex);
    pageData.changes.forEach((candidate: unknown, index: number) => {
      const source = sourceForNode(nodes[index], page, lineCounter, `changes[${index}]`);
      if (!isRule(candidate)) {
        diagnostics.push(
          diagnostic(
            'INVALID_RULE',
            'Правило должно содержать строковый id (или массив строк) и объект attributes',
            'warning',
            source
          )
        );
        return;
      }
      if (candidate.attributes.metrics !== undefined && !isMetrics(candidate.attributes.metrics)) {
        diagnostics.push(
          diagnostic(
            'INVALID_METRICS',
            'attributes.metrics должен быть объектом или массивом объектов',
            'warning',
            source
          )
        );
        return;
      }
      const rule: ConfigRules = { id: candidate.id, attributes: candidate.attributes, source };
      rules.push(rule);
      validateRule(rule, diagnostics);
    });
  }
  if (!hasChangesBlock) {
    diagnostics.push(
      diagnostic('MISSING_CHANGES', 'Не найден блок "changes" с правилами', 'warning', pageSource(pages[0]))
    );
  }
  return { rules, diagnostics, status: 'ready' };
}

/** Backwards-compatible convenience API used by existing panel consumers. */
export function parseYamlConfig(input: PanelConfigInput): ConfigRules[] | null {
  const parsed = parsePanelConfig(input);
  return parsed.status === 'ready' ? parsed.rules : null;
}

function normalizeInput(
  input: PanelConfigInput
): { ok: true; pages: Array<Omit<InputPage, 'wrapperLine'>> } | { ok: false; message: string } {
  if (input === undefined || input === null) {
    return { ok: true, pages: [] };
  }
  if (typeof input === 'string') {
    return { ok: true, pages: input.trim() ? [{ page: 'Page 1', code: input, pageIndex: 0 }] : [] };
  }
  if (!Array.isArray(input)) {
    return { ok: false, message: 'Конфигурация должна быть строкой или массивом страниц' };
  }
  if (input.every((item) => typeof item === 'string')) {
    return {
      ok: true,
      pages: input
        .map((code, pageIndex) => ({ page: `Page ${pageIndex + 1}`, code, pageIndex }))
        .filter(({ code }) => code.trim()),
    };
  }
  if (input.every((item) => isRecord(item) && typeof item.code === 'string')) {
    return {
      ok: true,
      pages: input
        .map((item, pageIndex) => ({
          page: typeof item.page === 'string' ? item.page : `Page ${pageIndex + 1}`,
          code: item.code,
          pageIndex,
        }))
        .filter(({ code }) => code.trim()),
    };
  }
  return { ok: false, message: 'Массив конфигурации должен состоять из строк или страниц с полем code' };
}

function wrapPages(pages: Array<Omit<InputPage, 'wrapperLine'>>): InputPage[] {
  let wrapperLine = 1;
  return pages.map((page) => {
    const wrapped = { ...page, wrapperLine };
    wrapperLine += page.code.split('\n').length + 1;
    return wrapped;
  });
}

const indent = (code: string) =>
  code
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
const pageSource = (page: InputPage): DiagnosticSource => ({ page: page.page, pageIndex: page.pageIndex });

function sourceForNode(node: any, page: InputPage, lineCounter: YAML.LineCounter, path: string): DiagnosticSource {
  const source: DiagnosticSource = { ...pageSource(page), path };
  if (node?.range?.[0] !== undefined) {
    const position = lineCounter.linePos(node.range[0]);
    source.line = position.line - page.wrapperLine;
    source.column = Math.max(1, position.col - 2);
  }
  return source;
}

function sourceForError(error: any, pages: InputPage[]): DiagnosticSource | undefined {
  const position = error?.linePos?.[0] || error?.linePos;
  if (!position || typeof position.line !== 'number') {
    return undefined;
  }
  const page = pages.find(
    (candidate) =>
      position.line > candidate.wrapperLine &&
      position.line <= candidate.wrapperLine + candidate.code.split('\n').length
  );
  return page
    ? { ...pageSource(page), line: position.line - page.wrapperLine, column: Math.max(1, (position.col || 1) - 2) }
    : undefined;
}

function changesNodes(root: any, pageIndex: number): any[] {
  const pagePair = root?.items?.find((pair: any) => pair?.key?.value === `page_${pageIndex}`);
  const changesPair = pagePair?.value?.items?.find((pair: any) => pair?.key?.value === 'changes');
  return Array.isArray(changesPair?.value?.items) ? changesPair.value.items : [];
}

function isRule(value: unknown): value is { id: string | string[]; attributes: Record<string, any> } {
  const validId = (id: unknown) => typeof id === 'string' && id.trim().length > 0;
  return (
    isRecord(value) &&
    (validId(value.id) || (Array.isArray(value.id) && value.id.length > 0 && value.id.every(validId))) &&
    isRecord(value.attributes)
  );
}

function isMetrics(value: unknown): value is Metrics | Metrics[] {
  return isRecord(value) || Array.isArray(value);
}

function validateRule(rule: ConfigRules, diagnostics: Diagnostic[]): void {
  const hideNoDataWarnings = rule.attributes.tooltip?.hideNoDataWarnings;
  if (hideNoDataWarnings !== undefined && typeof hideNoDataWarnings !== 'boolean') {
    diagnostics.push(
      diagnostic(
        'INVALID_TOOLTIP_SETTING',
        'tooltip.hideNoDataWarnings должен быть true или false',
        'warning',
        rule.source
      )
    );
  }
  const metrics = rule.attributes.metrics;
  const metricList = Array.isArray(metrics) ? metrics : metrics ? [metrics] : [];
  metricList.forEach((metric, metricIndex) => {
    if (!isRecord(metric)) {
      diagnostics.push(
        diagnostic('INVALID_METRIC', 'Настройка metric должна быть объектом', 'warning', {
          ...rule.source,
          path: `${rule.source?.path ?? 'changes'}.metrics[${metricIndex}]`,
        })
      );
      return;
    }
    validateSettings(metric, rule.source, diagnostics);
    if (metric.queries === undefined) {
      return;
    }
    if (!Array.isArray(metric.queries)) {
      diagnostics.push(diagnostic('INVALID_QUERIES', 'metrics.queries должен быть массивом', 'warning', rule.source));
      return;
    }
    metric.queries.forEach((query, queryIndex) => {
      if (!isRecord(query)) {
        diagnostics.push(
          diagnostic('INVALID_QUERY', 'Запрос metric должен быть объектом', 'warning', {
            ...rule.source,
            path: `${rule.source?.path ?? 'changes'}.queries[${queryIndex}]`,
          })
        );
        return;
      }
      validateSettings(query, { ...rule.source, refId: query.refid, legend: query.legend }, diagnostics);
    });
  });
}

function validateSettings(settings: any, source: DiagnosticSource | undefined, diagnostics: Diagnostic[]): void {
  if (settings.calculation !== undefined && !CALCULATIONS.has(settings.calculation)) {
    diagnostics.push(
      diagnostic(
        'UNKNOWN_CALCULATION',
        `Неизвестный расчёт "${settings.calculation}"; будет использован last`,
        'warning',
        source
      )
    );
  }
  if (settings.thresholds === undefined) {
    return;
  }
  if (!Array.isArray(settings.thresholds)) {
    diagnostics.push(diagnostic('INVALID_THRESHOLDS', 'thresholds должен быть массивом', 'warning', source));
    return;
  }
  settings.thresholds.forEach((threshold: any, thresholdIndex: number) => {
    if (!isRecord(threshold)) {
      diagnostics.push(
        diagnostic('INVALID_THRESHOLD', 'Порог должен быть объектом', 'warning', { ...source, thresholdIndex })
      );
      return;
    }
    if (threshold?.operator !== undefined && !OPERATORS.has(threshold.operator)) {
      diagnostics.push(
        diagnostic('UNKNOWN_OPERATOR', `Неизвестный оператор порога "${threshold.operator}"`, 'warning', {
          ...source,
          thresholdIndex,
        })
      );
    }
  });
}

const diagnostic = (
  code: string,
  message: string,
  severity: Diagnostic['severity'],
  source?: DiagnosticSource
): Diagnostic => ({ code, message, severity, source });

/** Схемы для быстрой настройки конфигурации. */
export function applySchema(attributes: any, schema: string) {
  if (!schema) {
    return attributes;
  }

  const result = { ...attributes };
  const processMetrics = (metrics: Metrics | Metrics[], processor: (metric: Metrics) => Metrics) => {
    if (Array.isArray(metrics)) {
      return metrics.map(processor);
    }
    return processor(metrics);
  };

  const schemaActions: Record<string, () => void> = {
    basic: () => {
      delete result.label;
      delete result.labelColor;
      result.tooltip = result.tooltip || { show: true };
      if (result.metrics) {
        result.metrics = processMetrics(result.metrics, (metric: Metrics) => ({
          ...metric,
          filling: 'fill',
          baseColor: metric.baseColor || '#00ff00',
        }));
      }
    },
    stroke: () => {
      const propsToDelete = ['link', 'label', 'labelColor', 'tooltip'];
      propsToDelete.forEach((p) => delete result[p]);
      if (result.metrics) {
        result.metrics = processMetrics(result.metrics, (metric: Metrics) => ({
          ...metric,
          filling: 'stroke',
          baseColor: '',
        }));
      }
    },
    strokeBase: () => {
      const propsToDelete = ['link', 'label', 'labelColor', 'tooltip'];
      propsToDelete.forEach((p) => delete result[p]);
      if (result.metrics) {
        result.metrics = processMetrics(result.metrics, (metric: Metrics) => ({
          ...metric,
          filling: 'stroke',
        }));
      }
    },
    text: () => {
      delete result.link;
      delete result.tooltip;
      result.label = result.label || 'replace';
      result.labelColor = result.labelColor || 'metric';
      if (result.metrics) {
        result.metrics = processMetrics(result.metrics, (metric: Metrics) => ({
          ...metric,
          filling: 'none',
          baseColor: metric.baseColor || '',
        }));
      }
    },
    table: () => {
      delete result.link;
      delete result.tooltip;
      result.label = result.label || 'replace';
      result.labelColor = result.labelColor || 'metric';
      if (result.metrics) {
        result.metrics = processMetrics(result.metrics, (metric: Metrics) => ({
          ...metric,
          filling: 'fill, 20',
          baseColor: metric.baseColor || '#00ff00',
        }));
      }
    },
  };

  schemaActions[schema]?.();
  return result;
}

/** Parses filter grammar only; dynamic dates are resolved when a panel is evaluated. */
export function parseFilter(text: string): filter | undefined {
  if (!text || !text.trim()) {
    return undefined;
  }
  const parsed: filter = { include: {}, exclude: {} };
  text
    .split(',')
    .map((condition) => condition.trim())
    .filter(Boolean)
    .forEach((raw) => {
      const exclusion = raw.startsWith('-');
      const condition = exclusion ? raw.slice(1).trim() : raw;
      const separator = condition.indexOf(':');
      const header = separator < 0 ? '' : condition.slice(0, separator).trim();
      const values = separator < 0 ? condition : condition.slice(separator + 1);
      const target = exclusion ? parsed.exclude : parsed.include;
      target[header] ||= [];
      target[header].push(
        ...values
          .split('|')
          .map((value) => value.trim())
          .filter(Boolean)
      );
    });
  return parsed;
}

/** Resolves $date and $dateN against an explicit UTC instant, returning a fresh filter. */
export function resolveFilterDates(preparedFilter: filter | undefined, timeTo: number | Date): filter | undefined {
  if (!preparedFilter) {
    return undefined;
  }
  const timestamp = timeTo instanceof Date ? timeTo.valueOf() : timeTo;
  const resolve = (value: string) => {
    const match = value.match(/^\$date(-?\d+)?$/);
    if (!match || !Number.isFinite(timestamp)) {
      return value;
    }
    const date = new Date(timestamp);
    date.setUTCDate(date.getUTCDate() + Number(match[1] || 0));
    return date.toISOString().slice(0, 10);
  };
  const copy = (map: Record<string, string[]> | undefined) => {
    if (map === undefined) {
      return {};
    }
    if (
      !isRecord(map) ||
      Object.values(map).some((values) => !Array.isArray(values) || values.some((value) => typeof value !== 'string'))
    ) {
      throw new CalculationError('INVALID_FILTER', 'В include/exclude фильтра ожидаются массивы строк');
    }
    return Object.fromEntries(Object.entries(map).map(([key, values]) => [key, values.map(resolve)]));
  };
  if (!isRecord(preparedFilter)) {
    throw new CalculationError('INVALID_FILTER', 'Ожидается разобранный объект фильтра');
  }
  return { include: copy(preparedFilter.include), exclude: copy(preparedFilter.exclude) };
}
