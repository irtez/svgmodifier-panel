import { displayMode } from 'types';
import {
  GridContent,
  MetricData,
  PanelEvaluation,
  TableMetricData,
  Tooltip,
  TooltipContent,
} from 'components/domain/models';
import { createSvgUpdateOperation } from 'components/infrastructure/svg/operations';
import { tooltipDiagnostics } from './tooltipDiagnostics';

export interface NotifyOptions {
  show: boolean;
  threshold: number | undefined;
}

export interface CalculateOptions {
  mode: displayMode;
  notifySettings: NotifyOptions;
}

export interface PanelPresentation {
  operations: Array<() => void> | undefined;
  tooltipContent: TooltipContent[] | undefined;
  gridContent: GridContent[] | undefined;
  dataSourceMap: Map<string, Set<string>> | undefined;
}

export const NO_DATA_COLOR = '#8e8e8e';

export function buildPanelPresentation(
  evaluation: PanelEvaluation,
  elementsById: Map<string, SVGElement>,
  options: CalculateOptions
): PanelPresentation {
  const tooltipContent = options.mode === 'svg' ? ([] as TooltipContent[]) : undefined;
  const operations = options.mode === 'svg' ? ([] as Array<() => void>) : undefined;
  const gridContent = options.mode === 'grid' ? ([] as GridContent[]) : undefined;
  const dataSourceMap = options.notifySettings.show ? new Map<string, Set<string>>() : undefined;

  // Сначала снимаем удалённые правила, затем красим текущие: id могут быть вложены.
  if (operations) {
    const activeIds = new Set(evaluation.elements.map((element) => element.id));
    for (const [id, target] of elementsById) {
      if (!activeIds.has(id)) {
        operations.push(createSvgUpdateOperation(target));
      }
    }
  }

  for (const element of evaluation.elements) {
    for (const rule of element.rules) {
      if (!rule.hasMetrics) {
        continue;
      }

      if (tooltipContent && rule.attributes.tooltip?.show) {
        for (const field of rule.fields) {
          pushTooltipItem(element.id, field, rule.attributes.tooltip, tooltipContent);
        }
        for (const table of rule.tables) {
          pushTooltipItem(element.id, table, rule.attributes.tooltip, tooltipContent);
        }
        const messages = tooltipDiagnostics(
          rule.diagnostics ?? [],
          rule.attributes.tooltip.hideNoDataWarnings === true
        );
        if (messages.length || element.noData) {
          let item = tooltipContent.find((item) => item.id === element.id);
          if (!item) {
            item = {
              id: element.id,
              textAbove: rule.attributes.tooltip.textAbove,
              textBelow: rule.attributes.tooltip.textBelow,
            };
            tooltipContent.push(item);
          }
          if (messages.length) {
            item.diagnostics = tooltipDiagnostics([...(item.diagnostics ?? []), ...messages]);
          }
          if (element.noData) {
            item.noData = true;
          }
        }
      }

      if (dataSourceMap) {
        for (const field of rule.fields) {
          collectDataSource(field, options.notifySettings.threshold, dataSourceMap);
        }
      }

      if (gridContent) {
        let gridItem = gridContent.find((item) => item.id === element.id);
        if (!gridItem) {
          gridItem = {
            id: element.id,
            title: rule.attributes.title,
            color: element.noData ? NO_DATA_COLOR : element.winner?.color,
            fields: [],
            tables: [],
          };
          gridContent.push(gridItem);
        }

        gridItem.fields.push(...rule.fields);
        gridItem.tables.push(...rule.tables);
      }
    }

    if (operations) {
      operations.push(
        createSvgUpdateOperation(
          elementsById.get(element.id),
          element.selectedAttributes,
          element.winner,
          element.noData ? { color: NO_DATA_COLOR, filling: element.noData.filling } : undefined
        )
      );
    }
  }

  return { operations, tooltipContent, gridContent, dataSourceMap };
}

function collectDataSource(field: MetricData, threshold: number | undefined, dataSourceMap: Map<string, Set<string>>) {
  const currentMetric = field.metricValue ?? Number.NEGATIVE_INFINITY;
  const currentLvl = field.lvl ?? Number.NEGATIVE_INFINITY;

  if (!field.dsName || !field.refId) {
    return;
  }

  if (currentLvl > 0 || (threshold && threshold > 0 && currentMetric >= threshold)) {
    if (!dataSourceMap.has(field.dsName)) {
      dataSourceMap.set(field.dsName, new Set<string>());
    }
    dataSourceMap.get(field.dsName)!.add(field.refId);
  }
}

function pushTooltipItem(
  id: string,
  candidate: MetricData | TableMetricData,
  tooltip: Tooltip,
  tooltipContent: TooltipContent[]
) {
  const { textAbove, textBelow } = tooltip;
  const tooltipItem = tooltipContent.find((item) => item.id === id);

  if (isTableMetricData(candidate)) {
    const tableData = {
      headers: candidate.headers,
      columnsData: candidate.columnsData,
      title: candidate.title,
    };

    if (!tooltipItem) {
      tooltipContent.push({
        id,
        queryTableData: [tableData],
        textAbove,
        textBelow,
      });
    } else {
      if (!tooltipItem.queryTableData) {
        tooltipItem.queryTableData = [];
      }
      tooltipItem.queryTableData.push(tableData);
    }
    return;
  }

  const queryData = {
    label: candidate.label,
    metric: candidate.displayValue || candidate.metricValue.toString(),
    color: candidate.color,
    title: candidate.title,
  };

  if (!tooltipItem) {
    tooltipContent.push({
      id,
      queryData: [queryData],
      textAbove,
      textBelow,
    });
  } else {
    (tooltipItem.queryData ??= []).push(queryData);
  }
}

function isTableMetricData(candidate: MetricData | TableMetricData): candidate is TableMetricData {
  return 'columnsData' in candidate;
}
