import React, { useRef } from 'react';
import { Tooltip } from 'components/presentation/tooltips/svgTooltip/tooltip';
import { NotificationTooltip, useNotificationData } from 'components/presentation/tooltips/notifyTooltip';
import { usePanelContext } from 'components/application/context/panelContext';
import { useSvgMount, useSvgUpdates } from './hooks/useSvgPanel';
import { EMPTY_DS_MAP } from 'shared/constants';

interface SvgModePanelProps {
  height: number;
  width: number;
}

export const SvgModePanel: React.FC<SvgModePanelProps> = ({ height, width }) => {
  const { processedData, svgDoc, options, timeRange } = usePanelContext();

  const containerRef = useRef<HTMLDivElement>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);

  const mountedRootRef = useSvgMount(svgContainerRef, svgDoc);
  useSvgUpdates(processedData, mountedRootRef);

  const notificationData = useNotificationData(processedData?.dataSourceMap ?? EMPTY_DS_MAP, options.notifyTooltip);

  return (
    <div ref={containerRef} style={{ position: 'relative', height, width, overflow: 'hidden' }}>
      <div ref={svgContainerRef} style={{ display: 'block', height, width }} />

      <Tooltip
        containerRef={containerRef}
        tooltipContent={processedData?.tooltipContent || []}
        options={options.tooltip}
        timeRange={processedData?.timeRange ?? timeRange}
      />

      {notificationData.show && (
        <NotificationTooltip
          count={notificationData.count}
          dataSourceNames={notificationData.dataSourceNames}
          show={notificationData.show}
          options={options.notifyTooltip}
          containerRef={containerRef}
        />
      )}
    </div>
  );
};
