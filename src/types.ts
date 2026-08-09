export type displayMode = 'svg' | 'table' | 'grid';

export interface JsonData {
  svgCode: string;
  metricsMapping: Array<{
    page: string;
    code: string;
  }>;
  svgAspectRatio: string;
  customRelativeTime: string;
  fieldsCustomRelativeTime: string;
}

export interface GridMode {
  showOnlyFiring?: boolean;
  sortByFiring?: boolean;
  columnMode: 'auto' | 'custom';
  columns?: number | 'auto';
  layout?: 'grid' | 'columns';
  stretch?: boolean;
  emptyPlaceholder?: string;
}

export interface TableMode {
  rows: number;
  columns: number;
}

export interface Expr {
  refId: string;
  expression: string;
}

export interface Transformations {
  expressions: Expr[];
  RelativeTime: string;
  fieldsRelativeTime: string;
}

export interface Tooltip {
  sort: 'none' | 'ascending' | 'descending';
  maxWidth: number;
  maxHeight: number;
  valuePosition: 'standard' | 'right';
  hideZeros: boolean;
}

export interface NotifyTooltip {
  show: boolean;
  offsetX: number;
  offsetY: number;
  threshold?: number;
  hideInEditMode: boolean;
  excludeFilter?: string;
  impactJson?: string;
}

export interface PanelOptions {
  displayMode: displayMode;
  grid: GridMode;
  table: TableMode;
  jsonData: JsonData;
  transformations: Transformations;
  tooltip: Tooltip;
  notifyTooltip: NotifyTooltip;
}
