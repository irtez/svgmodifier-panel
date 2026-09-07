import { DataFrame, FieldType, getFieldDisplayName, PanelData, TimeRange } from '@grafana/data';

import { FieldsTimeSettings, getFieldTimeRange } from 'components/domain/utils/timeSettings';
import { DataFrameMap } from 'components/domain/models';

export async function extractFields(panelData: PanelData, timeSettings: FieldsTimeSettings, timeRange: TimeRange) {
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

    const timeField = fields.find((field) => field.type === FieldType.time);
    const valueFields = fields.filter((field) => field.type === FieldType.number);
    if (visualType === 'graph' || (visualType !== 'table' && timeField && valueFields.length > 0)) {
      if (valueFields.length === 0) {
        continue;
      }

      for (const valueField of valueFields) {
        let values = valueField?.values.map(String);
        let timestamps = timeField?.values.map(Number) || [];
        const fieldDisplayName = getFieldDisplayName(valueField, frame, dataFrame);

        if (CustomRangeTime) {
          const result = getFieldTimeRange(timestamps, values, CustomRangeTime, timeRange);
          values = result.values;
          timestamps = result.timestamps;
        }

        addToMap(refId, valueMap, values, fieldDisplayName, timestamps, 'graph');
      }
      continue;
    }

    for (const field of fields) {
      if (!field.values) {
        continue;
      }

      const values = field.values.map(String);
      const Length = values.length;
      const fieldDisplayName = getFieldDisplayName(field, frame, dataFrame);

      addToMap(refId, valueMap, values, fieldDisplayName, undefined, 'table', Length);
    }
  }

  // console.log(Array.from(valueMap.entries()));
  return valueMap;
}

function addToMap(
  refId: string,
  valueMap: DataFrameMap,
  values: string[],
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

  refStore.values.set(uniqueName, { values: values, timestamps: timestamps });
}
