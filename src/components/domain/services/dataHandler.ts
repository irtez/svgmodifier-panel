import { matchPattern } from '../utils/common';
import { getConfig } from 'components/infrastructure/config/configBuilder';
import { resolveFilterDates } from 'components/infrastructure/config/parsers';
import { formatValues } from '../utils/valueTransformer';
import { getMappingMatch, calculateValue, getMetricColor, checkFilter } from '../utils/calculations';
import { CalculationError, numericValue, reportCalculationError } from '../utils/diagnostics';
import {
  DataFrameEntry,
  DataFrameMap,
  Diagnostic,
  EvaluatedCandidate,
  EvaluationContext,
  MetricData,
  Metrics,
  QueryType,
  TableMetricData,
  ValueMapping,
} from '../models';

/** Запись расчёта сохраняет query и диагностику, но без candidate не занимает место в autoConfig. */
export interface QuerySlot {
  counter: number;
  candidate?: EvaluatedCandidate;
  diagnostics: Diagnostic[];
  filling?: string;
}

export interface QueriesArray {
  fields?: MetricData[];
  tables?: TableMetricData[];
  slots?: QuerySlot[];
}

type Settings = ReturnType<typeof getConfig>;
type FieldResult = { legend: string; refId: string; value?: number; diagnostics: Diagnostic[] };

export function getMetricsData(
  metrics: Metrics[],
  data: DataFrameMap,
  mapping?: ValueMapping[],
  context: EvaluationContext = { timeTo: Date.now(), diagnostics: [] }
): QueriesArray {
  const result: QueriesArray = { fields: [], tables: [], slots: [] };
  let counter = 0;
  for (const metric of metrics ?? []) {
    for (const query of metric.queries ?? []) {
      counter++;
      const settings = getConfig(query, metric, mapping);
      // Старый YAML допускает оба способа выбора: sum считается для каждого
      // отдельно. Номер query общий, поэтому явные selectors не меняются.
      const selections: QueryType[] =
        settings.sum && query.refid && query.legend
          ? [{ refid: query.refid }, { legend: query.legend }]
          : [query];
      for (const selection of selections) {
        const ctx: EvaluationContext = {
          ...context,
          diagnostics: [],
          source: { ...context.source, refId: selection.refid, legend: selection.legend },
        };
        const start = result.slots!.length;
        try {
          if (typeof settings.filling !== 'string') {
            throw new CalculationError('INVALID_FILLING', 'filling должен быть строкой');
          }
          settings.filter = resolveFilterDates(settings.filter, context.timeTo);
          processQuery(selection, settings, data, result, counter, ctx);
        } catch (error) {
          reportCalculationError(ctx, error);
          result.slots!.push({
            counter,
            diagnostics: ctx.diagnostics,
            filling: typeof settings.filling === 'string' ? settings.filling : 'none',
          });
        }
        for (const slot of result.slots!.slice(start)) {
          context.diagnostics.push(...slot.diagnostics);
        }
      }
    }
  }
  return result;
}

function addCandidate(result: QueriesArray, candidate: EvaluatedCandidate, diagnostics: Diagnostic[]): void {
  if ('columnsData' in candidate) {
    result.tables!.push(candidate);
  } else {
    result.fields!.push(candidate);
  }
  result.slots!.push({
    counter: candidate.counter,
    candidate,
    diagnostics,
    filling: candidate.filling,
  });
}

function processQuery(
  query: QueryType,
  settings: Settings,
  data: DataFrameMap,
  result: QueriesArray,
  counter: number,
  context: EvaluationContext
): void {
  const fields: FieldResult[] = [];
  const collectFields = (entry: DataFrameEntry, refId: string, pattern?: string) => {
    for (const [legend, field] of entry.values) {
      if ((pattern && !matchPattern(pattern, legend)) || !checkFilter(legend, settings.filter)) {
        continue;
      }
      const fieldContext = {
        ...context,
        diagnostics: [] as Diagnostic[],
        source: { ...context.source, refId, legend },
      };
      let value: number | undefined;
      try {
        value = calculateValue(field.values.map(numericValue), settings.calculation);
      } catch (error) {
        reportCalculationError(fieldContext, error);
      }
      fields.push({ legend, refId, value, diagnostics: fieldContext.diagnostics });
    }
  };

  if (query.refid) {
    const entry = data.get(query.refid);
    if (!entry) {
      throw new CalculationError('MISSING_INPUT', `Нет данных по запросу ${query.refid}`);
    }
    if (entry.type === 'table') {
      const table = processTable(entry, data, settings, counter, query.refid, context);
      addCandidate(result, table, context.diagnostics);
    } else {
      collectFields(entry, query.refid);
    }
  }
  if (query.legend) {
    for (const [refId, entry] of data) {
      collectFields(entry, refId, query.legend);
    }
  }
  if (!fields.length) {
    if (query.refid && data.get(query.refid)?.type === 'table') {
      return;
    }
    throw new CalculationError(
      'EMPTY_INPUT',
      `Нет подходящих значений для ${query.refid || query.legend || 'запроса'}`
    );
  }

  if (settings.sum) {
    const failures = fields.flatMap((field) => field.diagnostics);
    if (fields.some((field) => field.value === undefined)) {
      // Неполная сумма не выдаётся за полную, остальные запросы продолжают работать.
      result.slots!.push({ counter, diagnostics: failures, filling: settings.filling });
      return;
    }
    const total = fields.reduce((sum, field) => sum + field.value!, 0);
    if (!Number.isFinite(total)) {
      throw new CalculationError('NON_FINITE_VALUE', 'Сумма не вернула конечное число');
    }
    addField({ legend: settings.sum, refId: '', value: total, diagnostics: [] }, 0);
    return;
  }
  fields.forEach(addField);

  function addField(field: FieldResult, index: number): void {
    if (field.value === undefined) {
      result.slots!.push({ counter, diagnostics: field.diagnostics, filling: settings.filling });
      return;
    }
    const ctx = {
      ...context,
      diagnostics: field.diagnostics,
      source: { ...context.source, refId: field.refId || undefined, legend: field.legend },
    };
    const { color, lvl } = getMetricColor(field.value, data, settings.thresholds, settings.baseColor, ctx);
    let displayValue = formatValues(field.value, settings.unit, settings.decimal);
    if (settings.mapping) {
      displayValue = getMappingMatch(settings.mapping, field.value, settings.decimal) ?? displayValue;
    }
    addCandidate(
      result,
      {
        counter,
        label: getLabel(field.legend, settings.label),
        color,
        lvl,
        metricValue: field.value,
        displayValue,
        filling: settings.filling,
        title: index === 0 ? settings.title || '' : '',
        dsName: settings.dataSourceName ?? data.get(field.refId)?.dataSourceName,
        refId: field.refId || undefined,
      },
      field.diagnostics
    );
  }
}

function processTable(
  entry: DataFrameEntry,
  data: DataFrameMap,
  settings: Settings,
  counter: number,
  refId: string,
  context: EvaluationContext
): TableMetricData {
  const headers = [...entry.values.keys()];
  const columns = [...entry.values.values()].map((field) => field.values);
  const rowCount = entry.length ?? columns[0]?.length ?? 0;
  if (!headers.length || !rowCount) {
    throw new CalculationError('EMPTY_INPUT', 'Таблица не содержит строк');
  }
  let thresholdIndex: number | undefined;
  if (settings.thresholdKey) {
    const exact = headers.indexOf(settings.thresholdKey);
    const matches = headers.flatMap((header, index) => (header.startsWith(settings.thresholdKey!) ? [index] : []));
    if (exact >= 0) {
      thresholdIndex = exact;
    } else if (matches.length === 1) {
      thresholdIndex = matches[0];
    } else {
      throw new CalculationError(
        matches.length ? 'AMBIGUOUS_FIELD' : 'MISSING_FIELD',
        matches.length
          ? `Несколько колонок подходят под ${settings.thresholdKey}`
          : `Колонка ${settings.thresholdKey} не найдена`
      );
    }
  }
  const table: TableMetricData = {
    counter,
    headers,
    columnsData: [],
    filling: settings.filling,
    title: settings.title,
    label: thresholdIndex === undefined ? '' : headers[thresholdIndex],
    dsName: settings.dataSourceName ?? entry.dataSourceName,
    refId,
  };
  let winner: { value: number; displayValue: string; color?: string; lvl: number; rowIndex: number } | undefined;
  for (let i = 0; i < rowCount; i++) {
    const row = columns.map((column) => column[i]);
    if (!headers.every((header, column) => checkFilter(String(row[column]), settings.filter, header))) {
      continue;
    }
    let color: string | undefined;
    let lvl: number | undefined;
    if (thresholdIndex !== undefined) {
      const value = numericValue(row[thresholdIndex]);
      if (!Number.isFinite(value)) {
        reportCalculationError(
          context,
          new CalculationError(
            'NON_FINITE_VALUE',
            `Строка ${i + 1}: значение ${headers[thresholdIndex]} не является конечным числом`
          )
        );
      } else {
        ({ color, lvl } = getMetricColor(value, data, settings.thresholds, settings.baseColor, context));
        const displayValue =
          (settings.mapping && getMappingMatch(settings.mapping, value, settings.decimal)) ??
          formatValues(value, settings.unit, settings.decimal);
        row[thresholdIndex] = displayValue;
        if (!winner || lvl > winner.lvl) {
          winner = { value, color, lvl, displayValue, rowIndex: table.columnsData.length };
        }
      }
    }
    table.columnsData.push({ row, color, lvl });
  }
  if (!table.columnsData.length) {
    throw new CalculationError('EMPTY_INPUT', 'После фильтрации в таблице нет строк');
  }
  if (thresholdIndex !== undefined && !winner) {
    // Ошибки строк уже объясняют причину; общий результат таблицы отсутствует.
    throw new CalculationError('EMPTY_INPUT', 'В выбранной колонке нет пригодных значений');
  }
  if (winner) {
    table.metricValue = winner.value;
    table.displayValue = winner.displayValue;
    table.color = winner.color;
    table.lvl = winner.lvl;
    table.winningRowIndex = winner.rowIndex;
  } else {
    // Таблица без thresholdKey предназначена для чтения, не для выбора цвета.
    table.lvl = 0;
  }
  return table;
}

function getLabel(displayName: string, label?: string): string {
  return (label || displayName).replace(/_prfx\d+/g, '').replace(/\{\{legend\}\}/g, displayName);
}
