export interface ExtractedField {
  values: Array<string | null | undefined>;
  timestamps?: number[];
}

export type DataFrameEntry = {
  type?: string;
  length?: number;
  dataSourceName?: string;
  values: Map<string, ExtractedField>;
};

export type DataFrameMap = Map<string, DataFrameEntry>;
