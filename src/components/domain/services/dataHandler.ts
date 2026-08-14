import { matchPattern } from '../utils/common';
import { defaultConfig, getConfig } from 'components/infrastructure/config/configBuilder';
import { formatValues } from '../utils/valueTransformer';
import { getMappingMatch, calculateValue, getMetricColor, checkFilter } from 'components/domain/utils/calculations';
import {
  QuerySpecificSettings,
  Metrics,
  ValueMapping,
  QueryType,
  MetricData,
  TableMetricData,
  DataFrameMap,
  DataFrameEntry,
} from 'components/domain/models';

export type QueriesArray = {
  fields?: MetricData[];
  tables?: TableMetricData[];
};

type Fields = Array<{ legend: string; value: number; globalKey?: string }>;

export function getMetricsData(metrics: Metrics[], data: DataFrameMap, mapping?: ValueMapping[]): QueriesArray {
  const queriesArray: QueriesArray = { fields: [], tables: [] };

  if (!data?.size || !metrics?.length) {
    return queriesArray;
  }

  let counter = 1;
  for (const metric of metrics) {
    metric.queries?.forEach((query) => {
      const config = getConfig(query, metric, mapping);
      getQueriesFromDataFrame(query, queriesArray, data, config, counter++);
    });
  }

  return queriesArray;
}

function getQueriesFromDataFrame(
  query: QueryType,
  queriesArray: QueriesArray,
  dataFrame: DataFrameMap,
  config: typeof defaultConfig,
  counter: number
) {
  if (query.refid) {
    const extractedData = dataFrame.get(query.refid);

    if (!extractedData) {
      return;
    }

    if (extractedData.dataSourceName) {
      query.dataSourceName = extractedData.dataSourceName;
    }

    if (extractedData.type === 'table') {
      const table = processTable(extractedData, dataFrame, counter, config, query.refid);
      if (table) {
        queriesArray.tables?.push(table);
      }
    } else {
      const fields: Fields = [];
      for (const [innerKey, values] of extractedData.values) {
        if (checkFilter(innerKey, config.filter)) {
          const value = calculateValue(values.values.map(Number), config.calculation);
          fields.push({ legend: innerKey, value, globalKey: query.refid });
        }
      }
      processFields(fields, queriesArray, config, dataFrame, counter);
    }
  }

  if (query.legend) {
    const fields: Fields = [];
    for (const [globalKey, metricData] of dataFrame) {
      for (const [innerKey, values] of metricData.values) {
        if (matchPattern(query.legend, innerKey) && checkFilter(innerKey, config.filter)) {
          if (metricData.dataSourceName) {
            query.dataSourceName = metricData.dataSourceName;
          }
          const value = calculateValue(values.values.map(Number), config.calculation);
          fields.push({ legend: innerKey, value, globalKey });
        }
      }
    }
    processFields(fields, queriesArray, config, dataFrame, counter);
  }
}

function processFields(
  fields: Fields,
  queriesArray: QueriesArray,
  config: typeof defaultConfig,
  dataFrame: DataFrameMap,
  counter: number
) {
  if (fields.length === 0) {
    return;
  }

  const addToArray = (value: number, title: string, label: string, refId?: string) => {
    let displayValue = formatValues(value, config.unit, config.decimal);

    if (config.mapping) {
      displayValue = getMappingMatch(config.mapping, value, config.decimal) ?? displayValue;
    }

    const { color, lvl } = getMetricColor(value, dataFrame, config.thresholds, config.baseColor);

    queriesArray.fields?.push({
      counter: counter,
      label,
      color,
      lvl,
      metricValue: value,
      displayValue,
      filling: config.filling,
      title,
      dsName: config.dataSourceName,
      refId: refId,
    });
  };

  if (config.sum) {
    const value = getSum(fields);
    const title = getTitle(config.title, 0);
    const label = getLabel(config.sum, config.label) || '';

    addToArray(value, title, label);
    return;
  }

  fields.forEach((query, index) => {
    const value = query.value;
    const title = getTitle(config.title, index);
    const label = getLabel(query.legend, config.label) || '';
    const refId = query.globalKey;

    addToArray(value, title, label, refId);
  });
}

function processTable(
  extractedData: DataFrameEntry,
  dataFrame: DataFrameMap,
  counter: number,
  config: typeof defaultConfig,
  refId?: string
) {
  const headers = Array.from(extractedData.values.keys());
  const colCount = headers.length;
  const rowCount = extractedData.length;

  if (!rowCount || !colCount) {
    return;
  }

  const columns = Array.from(extractedData.values.values()).map((col) => col.values);

  const table: TableMetricData = {
    counter: counter,
    headers: headers,
    columnsData: [],
    filling: config.filling,
    title: config.title,
    label: '',
    metricValue: 0,
    dsName: config.dataSourceName,
    refId: refId,
  };

  let maxLvl = -1;
  let thKeyIndex: number | undefined;

  if (config.thresholdKey) {
    const key = config.thresholdKey;
    thKeyIndex = headers.findIndex((item: string) => item.startsWith(key));
  }

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    const row = columns.map((col) => col[rowIndex]);

    if (config.filter) {
      const passes = headers.every((header, i) => checkFilter(String(row[i]), config.filter, header));
      if (!passes) {
        continue;
      }
    }

    let color: string | undefined;
    let lvl: number | undefined = -1;

    if (thKeyIndex !== undefined && thKeyIndex !== -1) {
      const rawValue = row[thKeyIndex];
      const numericValue = Number(rawValue);
      let displayValue = formatValues(numericValue, config.unit, config.decimal);

      if (!isNaN(numericValue)) {
        const result = getMetricColor(numericValue, dataFrame, config.thresholds, config.baseColor);
        lvl = result.lvl;
        color = result.color;

        if (lvl > maxLvl) {
          maxLvl = lvl;
        }
      }

      if (config.mapping) {
        displayValue = getMappingMatch(config.mapping, numericValue, config.decimal) ?? displayValue;
      }

      if (displayValue) {
        row[thKeyIndex] = displayValue;
      }
    }

    table.columnsData.push({ row, color, lvl });
  }

  if (table.columnsData.length === 0) {
    return;
  }
  table.lvl = maxLvl !== -1 ? maxLvl : 0;
  table.color = table.columnsData[table.columnsData.length - 1].color;

  if (thKeyIndex !== undefined && thKeyIndex !== -1) {
    table.label = headers[thKeyIndex];
    table.metricValue = table.columnsData[table.columnsData.length - 1].row[thKeyIndex];
  }

  return table;
}

function getLabel(displayName: string, label?: string): string {
  if (!label) {
    label = displayName;
  }

  label = label.replace(/_prfx\d+/g, '').replace(/\{\{legend\}\}/g, displayName);
  return label;
}

function getTitle(query: QuerySpecificSettings['title'], counter: number): string {
  return query && counter === 0 ? query : '';
}

function getSum(data: Fields): number {
  return data.reduce((acc, item) => acc + item.value, 0);
}
