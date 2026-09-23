import { TimeRange } from '@grafana/data';

const timeUnits: { [key: string]: number } = {
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

export type FieldsTimeSettings =
  | {
      global?: string;
      fields?: Map<string, string>;
    }
  | undefined;

export function getCustomTimeSettings(relativeTime?: string, fieldsRelativeTime?: string): FieldsTimeSettings {
  const timeSettings: FieldsTimeSettings = {
    global: undefined,
    fields: undefined,
  };

  if (!relativeTime && !fieldsRelativeTime) {
    return timeSettings;
  }

  if (relativeTime) {
    timeSettings.global = relativeTime;
  }

  if (fieldsRelativeTime) {
    try {
      timeSettings.fields = new Map();
      const rules = fieldsRelativeTime.split(';').filter(Boolean);
      // const rules = fieldsRelativeTime.split(';').filter((rule) => rule.trim());

      for (const rule of rules) {
        const [fieldsPart, timePart] = rule.split(':').map((part) => part.trim());

        if (!fieldsPart || !timePart) {
          continue;
        }

        const fieldNames = fieldsPart.split(',').map((field) => field.trim());
        const timeValue = timePart.trim();

        for (const fieldName of fieldNames) {
          if (fieldName) {
            timeSettings.fields?.set(fieldName, timeValue);
          }
        }
      }
    } catch {}
  }

  return timeSettings;
}

export function getFieldTimeRange<T>(
  timestamps: number[],
  values: T[],
  relativeTime: string,
  timeRange: TimeRange
): { timestamps: number[]; values: T[] } {
  const unit = relativeTime.slice(-1);
  const value = parseInt(relativeTime.slice(0, -1), 10);

  if (!timeUnits[unit]) {
    return { timestamps, values };
  }

  const endTime = timeRange.to.valueOf();
  const timeRangeMs = value * timeUnits[unit];
  const startTime = endTime - timeRangeMs;

  // Находим индексы элементов, попадающих в диапазон
  const filteredIndices: number[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (timestamps[i] >= startTime && timestamps[i] <= endTime) {
      filteredIndices.push(i);
    }
  }

  if (filteredIndices.length === 0) {
    return {
      timestamps: [],
      values: [],
    };
  }

  // Фильтруем оба массива по найденным индексам
  const relativeTimeStamps = filteredIndices.map((i) => timestamps[i]);
  const Values = filteredIndices.map((i) => values[i]);

  return {
    timestamps: relativeTimeStamps,
    values: Values,
  };
}
