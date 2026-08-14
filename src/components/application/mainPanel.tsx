import React from 'react';
import { PanelProps } from '@grafana/data';
import { PanelOptions } from 'types';
import { SvgModePanel } from 'components/presentation/components/svg/SvgPanel';
import { GridPanel } from 'components/presentation/components/grid/gridPanel';
import { PanelProvider } from './context/panelContext';

const Panel: React.FC<PanelProps<PanelOptions>> = ({ data, timeRange, options, height, width }) => {
  const mode = options.displayMode || 'svg';

  return (
    <PanelProvider data={data} timeRange={timeRange} options={options}>
      <div style={{ position: 'relative', height, width, overflow: 'hidden' }}>
        {mode === 'svg' && <SvgModePanel height={height} width={width} />}
        {mode === 'grid' && <GridPanel height={height} width={width} />}
      </div>
    </PanelProvider>
  );
};

export default Panel;
