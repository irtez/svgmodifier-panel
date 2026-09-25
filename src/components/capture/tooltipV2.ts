import type { ElementEvaluation, TooltipContent } from '../domain/models';
import type { PanelOptions } from 'types';
import type { TooltipV2 } from './modelsV2';
import type { DiagnosticIndexV2 } from './diagnosticsV2';
import { processTooltipContent } from '../presentation/tooltips/svgTooltip/utils';

export function captureTooltip(
  element: ElementEvaluation,
  content: TooltipContent | undefined,
  options: PanelOptions['tooltip'],
  candidates: ReadonlyMap<object, string>,
  diagnostics: DiagnosticIndexV2
): TooltipV2 {
  const scalarIds: string[] = [],
    tableIds: string[] = [];
  for (const rule of element.rules) {
    if (rule.hasMetrics && rule.attributes.tooltip?.show) {
      scalarIds.push(...rule.fields.map((f) => candidates.get(f)!));
      tableIds.push(...rule.tables.map((t) => candidates.get(t)!));
    }
  }
  const result: TooltipV2 = {
    status: element.rules.some((r) => r.attributes.tooltip?.show) ? 'empty' : 'disabled',
    metricIds: [],
    tables: [],
    textAbove: [],
    textBelow: [],
    diagnosticIds: [],
    noData: false,
  };
  if (!content) {
    return result;
  }
  if (
    scalarIds.length !== (content.queryData?.length ?? 0) ||
    tableIds.length !== (content.queryTableData?.length ?? 0) ||
    [...scalarIds, ...tableIds].some((id) => !id)
  ) {
    throw new Error('CAPTURE_TOOLTIP_BINDING_INVALID');
  }
  // UI sorting/filtering retains each entry's identity, even when labels/values coincide.
  const idByEntry = new Map(content.queryData?.map((entry, index) => [entry, scalarIds[index]]));
  const shown = processTooltipContent(content, options)!;
  result.metricIds = (shown.queryData ?? []).map((entry) => idByEntry.get(entry)!);
  result.tables = (shown.queryTableData ?? []).map((t, index) => ({
    metricId: tableIds[index],
    rowIndices: t.columnsData.map((_, i) => i).reverse(),
    ...(t.title === undefined ? {} : { title: t.title }),
  }));
  result.textAbove = Array.isArray(shown.textAbove) ? shown.textAbove.slice() : [];
  result.textBelow = Array.isArray(shown.textBelow) ? shown.textBelow.slice() : [];
  result.diagnosticIds = [
    ...new Set((shown.diagnostics ?? []).map((d) => diagnostics.add(d, { indicatorIds: [element.id] }))),
  ];
  result.noData = shown.noData === true;
  if (
    result.metricIds.length ||
    result.tables.length ||
    result.textAbove.length ||
    result.textBelow.length ||
    result.diagnosticIds.length ||
    result.noData
  ) {
    result.status = 'available';
  }
  return result;
}
