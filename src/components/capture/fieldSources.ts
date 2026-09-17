import type { DataFrame, Field } from '@grafana/data';

export interface FieldOrigin {
  fieldName: string;
  fieldType: string;
  frameName: string | null;
  frameIndex: number;
  fieldIndex: number;
  legend: string;
  labels: Record<string, string> | null;
  dataSource: {
    uid: string | null;
    type: string | null;
    name: string | null;
  };
  rawValues?: readonly unknown[];
}

type ExtractedField = { values: string[]; timestamps?: number[] };
export type FieldDataSourceOrigin = { uid?: unknown; type?: unknown; name?: unknown };

/** Capture-only индекс происхождения, не изменяющий рабочую модель данных. */
export class FieldSources {
  private readonly origins = new WeakMap<ExtractedField, FieldOrigin>();

  recordField(
    extracted: ExtractedField,
    frame: DataFrame,
    field: Field,
    frameIndex: number,
    legend: string,
    isTable: boolean,
    dataSourceOrigin?: FieldDataSourceOrigin
  ): void {
    const custom = frame.meta?.custom;
    const datasource = custom?.datasource ?? custom?.dataSource;
    const scalar = (value: unknown): string | null => (typeof value === 'string' ? value : null);

    const origin: FieldOrigin = {
      fieldName: field.name,
      fieldType: field.type,
      frameName: frame.name ?? null,
      frameIndex,
      fieldIndex: frame.fields.indexOf(field),
      legend,
      labels: field.labels ? { ...field.labels } : null,
      dataSource: {
        uid: scalar(datasource?.uid ?? custom?.datasourceUid ?? dataSourceOrigin?.uid),
        type: scalar(datasource?.type ?? custom?.datasourceType ?? dataSourceOrigin?.type),
        name: scalar(datasource?.name ?? custom?.datasourceName ?? dataSourceOrigin?.name),
      },
    };

    // Табличные значения нужны для сохранения исходных JSON-типов; массив не копируем.
    if (isTable) {
      origin.rawValues = field.values;
    }
    this.origins.set(extracted, origin);
  }

  getOrigin(extracted: ExtractedField): FieldOrigin | undefined {
    return this.origins.get(extracted);
  }
}
