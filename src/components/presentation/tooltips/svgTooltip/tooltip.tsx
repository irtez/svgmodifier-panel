import React from 'react';
import ReactDOM from 'react-dom';
import { useTheme2 } from '@grafana/ui';
import { TimeRange } from '@grafana/data';

import { PanelOptions } from 'types';
import { TooltipContent } from 'components/domain/models';
import { getTooltipContainerStyles, getContentClass, getDiagnosticStyles } from './styles';
import { useTooltipLogic } from './hooks';
import { TimeSection } from './sections/timeSection';
import { TextSection } from './sections/textSection';
import { MetricsSection } from './sections/metricsSection';
import { TableSection } from './sections/tableSection';

interface Props {
  containerRef: React.RefObject<HTMLDivElement>;
  tooltipContent: TooltipContent[];
  options: PanelOptions['tooltip'];
  timeRange: TimeRange;
}

const TooltipContentComponent: React.FC<{
  content: TooltipContent;
  timeRange: TimeRange;
  options: PanelOptions['tooltip'];
  onClose?: () => void;
  id: string;
  coords: { x: number; y: number };
}> = ({ content, timeRange, options, onClose, id, coords }) => {
  const theme = useTheme2();

  const validCheck = <T,>(arr: T | T[] | undefined | null): T[] | undefined =>
    Array.isArray(arr) && arr.length > 0 ? arr : undefined;

  const metrics = validCheck(content.queryData);
  const tableMetrics = validCheck(content.queryTableData);
  const textAbove = validCheck(content.textAbove);
  const textBelow = validCheck(content.textBelow);
  const diagnostics = validCheck(content.diagnostics);

  if (!Boolean(metrics || tableMetrics || textAbove || textBelow || diagnostics || content.noData)) {
    return null;
  }

  const baseStyles = getTooltipContainerStyles(theme, options, coords, !!tableMetrics);
  const containerStyles: React.CSSProperties = { ...baseStyles };

  return (
    <div data-tooltip-id={id} style={containerStyles}>
      <TimeSection timeRange={timeRange} onClose={onClose} />
      {/* Обёртка для скролла */}
      <div className={getContentClass} onWheel={(e) => e.stopPropagation()}>
        {textAbove && <TextSection currentText={textAbove as string[]} />}
        {metrics && <MetricsSection queryData={metrics} options={options} />}
        {tableMetrics && <TableSection tables={tableMetrics} />}
        {content.noData && (
          <div style={{ ...getDiagnosticStyles(), marginBottom: '8px' }}>Нет данных для определения состояния</div>
        )}
        {diagnostics && (
          <ul style={{ ...getDiagnosticStyles(), margin: '6px 0', paddingLeft: '20px' }}>
            {diagnostics.map((diagnostic, index) => (
              <li key={index}>
                {diagnostic.source?.legend ? `${diagnostic.source.legend}: ` : ''}
                {diagnostic.message}
              </li>
            ))}
          </ul>
        )}
        {textBelow && <TextSection currentText={textBelow as string[]} />}
      </div>
    </div>
  );
};

export const Tooltip: React.FC<Props> = ({ containerRef, tooltipContent, options, timeRange }) => {
  const { hoverTooltip, pinnedTooltips, adjustedCoords, adjustedHoverCoords, unpin } = useTooltipLogic(
    tooltipContent,
    containerRef,
    options
  );

  return ReactDOM.createPortal(
    <>
      {hoverTooltip && (
        <TooltipContentComponent
          id={hoverTooltip.id}
          content={hoverTooltip.content}
          timeRange={timeRange}
          options={options}
          coords={adjustedHoverCoords || { x: hoverTooltip.x, y: hoverTooltip.y }}
        />
      )}

      {pinnedTooltips.map((p) => (
        <TooltipContentComponent
          key={p.id}
          id={p.id}
          content={p.content}
          timeRange={timeRange}
          options={options}
          onClose={() => unpin(p.id)}
          coords={adjustedCoords[p.id] || { x: p.x, y: p.y }}
        />
      ))}
    </>,
    document.body
  );
};
