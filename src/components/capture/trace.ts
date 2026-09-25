import type {
  CalculationMethod,
  ConfigRules,
  DataFrameEntry,
  Diagnostic,
  ExtractedField,
  PreparedRule,
  QueryType,
} from '../domain/models';
import type { QuerySlot } from '../domain/services/dataHandler';
import type { getConfig } from '../infrastructure/config/configBuilder';
import type { Expr } from 'types';
import { FieldSources } from './fieldSources';
import { copyJson } from './jsonValues';

export interface InputTrace {
  token: string;
  refId: string;
  field: string | null;
  calculation: CalculationMethod;
  value?: number;
}
export interface CheckTrace {
  index: number;
  condition: 'true' | 'false' | 'error' | 'not_evaluated' | 'not_present';
  comparison: 'true' | 'false' | 'error' | 'not_evaluated';
  matched: boolean;
  inputs: InputTrace[];
  diagnostics: Diagnostic[];
}
export interface ColorTrace {
  checks: CheckTrace[];
  selectedThresholdIndex: number | null;
}
export interface SourceTrace {
  dataSourceName?: string;
  valueCount: number;
  fromMs: number | null;
  toMs: number | null;
  refId: string;
  legend: string;
  field: ExtractedField;
  calculation: CalculationMethod | null;
  value?: number;
  diagnostics: Diagnostic[];
}
export interface RowTrace {
  issues: Array<{ columnIndex: number; missing: boolean }>;
  sourceIndex: number;
  values: unknown[];
  display: unknown[];
  color: ColorTrace;
  decision?: { value: number; displayValue: string; color?: string; level: number };
}
export interface TableTrace {
  entry: DataFrameEntry;
  nextRow: number;
  rowFilterStatus: 'not_evaluated' | 'incomplete' | 'applied';
  columns: Array<{ name: string; type: string | null }>;
  rows: RowTrace[];
  thresholdColumnIndex: number | null;
}
export interface MetricTrace {
  slot: QuerySlot;
  query: QueryTrace;
  sources: SourceTrace[];
  color?: ColorTrace;
  table?: TableTrace;
}
export interface ExpressionTrace {
  expression: Expr;
  inputs: InputTrace[];
  value?: number;
  diagnostics: Diagnostic[];
  skipped?: string;
}

/** Только принятая capture-session создаёт этот объект; UI получает прежние модели. */
export class EvaluationTrace extends FieldSources {
  readonly prepared = new Map<PreparedRule, { authored: ConfigRules; elementId: string }>();
  readonly runs: RuleTrace[] = [];
  readonly expressions: ExpressionTrace[] = [];

  constructor(readonly rules: ConfigRules[]) {
    super();
  }

  preparedRule(authored: ConfigRules, prepared: PreparedRule, elementId: string) {
    this.prepared.set(prepared, { authored, elementId });
  }

  beginRule(prepared: PreparedRule, elementId: string): RuleTrace {
    const run = new RuleTrace(this, prepared, elementId);
    this.runs.push(run);
    return run;
  }

  expression(expression: Expr): ExpressionTrace {
    const result: ExpressionTrace = { expression, inputs: [], diagnostics: [] };
    this.expressions.push(result);
    return result;
  }
}

export class RuleTrace {
  readonly queries: QueryTrace[] = [];
  assigned = new Set<QuerySlot>();
  constructor(readonly root: EvaluationTrace, readonly prepared: PreparedRule, readonly elementId: string) {}

  query(
    metricsIndex: number,
    queryIndex: number,
    counter: number,
    selection: QueryType,
    settings: ReturnType<typeof getConfig>
  ) {
    const result = new QueryTrace(this, metricsIndex, queryIndex, counter, selection, settings);
    this.queries.push(result);
    return result;
  }
}

export class QueryTrace {
  readonly sources: SourceTrace[] = [];
  readonly results: MetricTrace[] = [];
  current?: { sources: SourceTrace[]; color?: ColorTrace; table?: TableTrace };

  constructor(
    readonly rule: RuleTrace,
    readonly metricsIndex: number,
    readonly queryIndex: number,
    readonly counter: number,
    readonly selection: QueryType,
    readonly settings: ReturnType<typeof getConfig>
  ) {}

  source(
    refId: string,
    legend: string,
    field: ExtractedField,
    diagnostics: Diagnostic[],
    dataSourceName?: string
  ): SourceTrace {
    const source: SourceTrace = {
      refId,
      legend,
      field,
      diagnostics,
      calculation: null,
      dataSourceName,
      ...sourceSummary(field),
    };
    this.sources.push(source);
    return source;
  }

  scalar(index: number | null) {
    this.current = {
      sources: index === null ? this.sources.slice() : [this.sources[index]],
      color: { checks: [], selectedThresholdIndex: null },
    };
  }

  table(entry: DataFrameEntry, refId: string) {
    const fields = [...entry.values.entries()];
    this.current = {
      sources: fields.map(([legend, field]) => ({
        refId,
        legend,
        field,
        calculation: null,
        diagnostics: [],
        dataSourceName: entry.dataSourceName,
        ...sourceSummary(field),
      })),
      table: {
        entry,
        nextRow: 0,
        rowFilterStatus: 'not_evaluated',
        columns: fields.map(([legend, field]) => {
          const origin = this.rule.root.getOrigin(field);
          return { name: origin?.fieldName ?? legend, type: origin?.fieldType ?? null };
        }),
        rows: [],
        thresholdColumnIndex: null,
      },
    };
  }

  row(entry: DataFrameEntry, sourceIndex: number, display: unknown[]): RowTrace {
    const issues: RowTrace['issues'] = [];
    const row: RowTrace = {
      issues,
      sourceIndex,
      display,
      values: [...entry.values.values()].map((field, columnIndex) => {
        const origin = this.rule.root.getOrigin(field);
        const value = origin?.rawValues ? origin.rawValues[sourceIndex] : field.values[sourceIndex];
        let invalid = false;
        const copied = copyJson(value, () => {
          invalid = true;
        });
        if (invalid) {
          issues.push({ columnIndex, missing: value === undefined });
          return null;
        }
        return copied;
      }),
      color: { checks: [], selectedThresholdIndex: null },
    };
    this.current!.table!.rows.push(row);
    this.current!.table!.nextRow = sourceIndex + 1;
    return row;
  }

  record(slot: QuerySlot) {
    const table = this.current?.table;
    if (!slot.candidate && table && table.rowFilterStatus !== 'applied') {
      // Сохраняем известные ячейки после раннего отказа, не выполняя фильтр/расчёт ещё раз.
      const rowCount = table.columns.length
        ? table.entry.length ?? table.entry.values.values().next().value?.values.length ?? 0
        : 0;
      for (let i = table.nextRow; i < rowCount; i++) {
        this.row(table.entry, i, Array(table.columns.length).fill(null));
      }
    }
    this.results.push({ slot, query: this, ...(this.current ?? { sources: this.sources.slice() }) });
    this.current = undefined;
  }
}

function sourceSummary(field: ExtractedField) {
  let fromMs: number | null = null;
  let toMs: number | null = null;
  for (const time of field.timestamps ?? []) {
    if (!Number.isSafeInteger(time)) {
      continue;
    }
    fromMs = fromMs === null ? time : Math.min(fromMs, time);
    toMs = toMs === null ? time : Math.max(toMs, time);
  }
  return { valueCount: field.values.length, fromMs, toMs };
}
