import type { Diagnostic, DiagnosticSource } from '../domain/models';
import type { DiagnosticV2, SourceLocationV2 } from './modelsV2';

export const addIds = (target: string[], values: readonly string[]) => {
  for (const value of values) {
    if (!target.includes(value)) {
      target.push(value);
    }
  }
};

export function sourceLocation(
  source?: DiagnosticSource,
  extra: Partial<SourceLocationV2> = {},
  invalid = (_key: string) => {}
): SourceLocationV2 {
  const strings = new Set(['page', 'path', 'refId', 'legend', 'expressionRefId']);
  const indices = new Set([
    'pageIndex',
    'line',
    'column',
    'metricsIndex',
    'queryIndex',
    'thresholdIndex',
    'rowIndex',
    'columnIndex',
  ]);
  return Object.fromEntries(
    Object.entries({ ...source, ...extra }).filter(([key, value]) => {
      if (value === undefined) {
        return false;
      }
      const valid = strings.has(key)
        ? typeof value === 'string'
        : indices.has(key) && Number.isSafeInteger(value) && Number(value) >= 0;
      if (!valid) {
        invalid(key);
      }
      return valid;
    })
  );
}

export class DiagnosticIndexV2 {
  readonly rows: DiagnosticV2[] = [];
  private readonly index = new Map<string, DiagnosticV2>();
  private readonly byId = new Map<string, DiagnosticV2>();

  add(
    item: Diagnostic,
    links: Partial<Pick<DiagnosticV2, 'indicatorIds' | 'ruleIds' | 'metricIds'>> = {},
    extra: Partial<SourceLocationV2> = {},
    ancestors = new Set<Diagnostic>()
  ): string {
    const invalid: string[] = [];
    const source = sourceLocation(item.source, extra, (key) => invalid.push(key));
    for (const key of invalid) {
      this.add(
        {
          code: 'CAPTURE_INVALID_VALUE',
          severity: 'warning',
          message: `Поле диагностики source.${key} опущено: неверный тип`,
          source,
        },
        links
      );
    }
    const key = JSON.stringify([
      item.code,
      item.severity,
      item.message,
      Object.entries(source).sort(([a], [b]) => a.localeCompare(b)),
    ]);
    let row = this.index.get(key);
    if (!row) {
      row = {
        id: 'diagnostic-' + this.rows.length,
        code: item.code,
        severity: item.severity,
        message: item.message,
        source,
        indicatorIds: [],
        ruleIds: [],
        metricIds: [],
        causeIds: [],
      };
      this.rows.push(row);
      this.index.set(key, row);
      this.byId.set(row.id, row);
    }
    addIds(row.indicatorIds, links.indicatorIds ?? []);
    addIds(row.ruleIds, links.ruleIds ?? []);
    addIds(row.metricIds, links.metricIds ?? []);
    if (!ancestors.has(item)) {
      ancestors.add(item);
      for (const cause of item.causes ?? []) {
        if (!ancestors.has(cause)) {
          const id = this.add(cause, links, {}, ancestors);
          if (id !== row.id) {
            addIds(row.causeIds, [id]);
          }
        }
      }
      ancestors.delete(item);
    }
    return row.id;
  }

  attach(
    ids: readonly string[],
    links: Partial<Pick<DiagnosticV2, 'indicatorIds' | 'ruleIds' | 'metricIds'>>,
    visited = new Set<string>()
  ) {
    for (const id of ids) {
      if (visited.has(id)) {
        continue;
      }
      visited.add(id);
      const row = this.byId.get(id);
      if (!row) {
        continue;
      }
      addIds(row.indicatorIds, links.indicatorIds ?? []);
      addIds(row.ruleIds, links.ruleIds ?? []);
      addIds(row.metricIds, links.metricIds ?? []);
      this.attach(row.causeIds, links, visited);
    }
  }
}
