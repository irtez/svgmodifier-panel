import { FieldType, getFieldDisplayName, type DataFrame, type PanelData, type TimeRange } from '@grafana/data';

import { FieldsTimeSettings, getFieldTimeRange } from 'components/domain/utils/timeSettings';
import { DataFrameMap, ExtractedField } from 'components/domain/models';
import type { FieldSources } from 'components/capture/fieldSources';

export async function extractFields(
  panelData: PanelData,
  timeSettings: FieldsTimeSettings,
  timeRange: TimeRange,
  capture?: FieldSources
) {
  const valueMap: DataFrameMap = new Map();
  const dataFrame = panelData.series;

  for (let i = 0; i < dataFrame.length; i++) {
    const frame: DataFrame = dataFrame[i];

    if (!frame.refId || !frame.fields?.length) {
      continue;
    }

    const { refId, fields, meta } = frame;
    const visualType = meta?.preferredVisualisationType;
    const CustomRangeTime = timeSettings?.fields?.get(refId) || timeSettings?.global;
    // request нужен только capture-пути; обычное извлечение его даже не читает.
    const dataSourceOrigin = capture?.readDataSource(() => getUnambiguousDataSource(panelData, refId));

    const timeField = fields.find((field) => field.type === FieldType.time);
    const valueFields = fields.filter((field) => field.type === FieldType.number);
    if (visualType === 'graph' || (visualType !== 'table' && timeField && valueFields.length > 0)) {
      if (valueFields.length === 0) {
        continue;
      }

      for (const valueField of valueFields) {
        let values = valueField.values.map(inputValue);
        let timestamps = timeField?.values.map(Number) || [];
        const fieldDisplayName = getFieldDisplayName(valueField, frame, dataFrame);

        if (CustomRangeTime) {
          const result = getFieldTimeRange(timestamps, values, CustomRangeTime, timeRange);
          values = result.values;
          timestamps = result.timestamps;
        }

        const extracted = addToMap(refId, valueMap, values, fieldDisplayName, timestamps, 'graph');
        capture?.recordField(extracted, frame, valueField, i, fieldDisplayName, false, dataSourceOrigin);
      }
      continue;
    }

    for (const field of fields) {
      if (!field.values) {
        continue;
      }

      const values = field.values.map(inputValue);
      const Length = values.length;
      const fieldDisplayName = getFieldDisplayName(field, frame, dataFrame);

      const extracted = addToMap(refId, valueMap, values, fieldDisplayName, undefined, 'table', Length);
      capture?.recordField(extracted, frame, field, i, fieldDisplayName, true, dataSourceOrigin);
    }
  }

  // console.log(Array.from(valueMap.entries()));
  return valueMap;
}

function getUnambiguousDataSource(panelData: PanelData, refId: string) {
  const matchingTargets = panelData.request?.targets?.filter((target) => target.refId === refId) ?? [];
  if (matchingTargets.length !== 1) {
    return undefined;
  }

  const target = matchingTargets[0];
  const panelId = (target as unknown as { panelId?: number }).panelId;
  const datasource = target.datasource;
  // Dashboard datasource проксирует запрос другой панели и не раскрывает исходный datasource.
  if (panelId != null || datasource?.uid === '-- Dashboard --' || datasource?.type === 'dashboard') {
    return undefined;
  }

  return datasource ?? undefined;
}

// Пропуск не превращаем в строку: иначе его нельзя отличить от неверного числа.
const inputValue = (value: unknown): string | null | undefined => (value == null ? value : String(value));

function addToMap(
  refId: string,
  valueMap: DataFrameMap,
  values: ExtractedField['values'],
  displayName: string,
  timestamps?: number[],
  type?: string,
  length?: number,
  dsName?: string
) {
  if (!valueMap.has(refId)) {
    valueMap.set(refId, { values: new Map(), type: type, length: length, dataSourceName: dsName });
  }

  let uniqueName = displayName;
  const refStore = valueMap.get(refId)!;

  let counter = 1;
  while (refStore.values.has(uniqueName)) {
    uniqueName = `${displayName}_${counter}`;
    counter++;
  }

  const extracted = { values: values, timestamps: timestamps };
  refStore.values.set(uniqueName, extracted);
  return extracted;
}
