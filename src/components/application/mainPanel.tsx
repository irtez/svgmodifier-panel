import React from 'react';
import { PanelProps } from '@grafana/data';
import { PanelOptions } from 'types';
import { SvgModePanel } from 'components/presentation/components/svg/SvgPanel';
import { GridPanel } from 'components/presentation/components/grid/gridPanel';
import { PanelProvider, usePanelContext } from './context/panelContext';

const UpdatingNotice = () => {
  const { isLoading } = usePanelContext();
  return isLoading ? (
    <span role="status" style={{ position: 'absolute', right: 8, top: 4, pointerEvents: 'none' }}>
      Обновляется…
    </span>
  ) : null;
};

const Panel: React.FC<PanelProps<PanelOptions>> = ({ id, data, timeRange, options, height, width }) => {
  const mode = options.displayMode || 'svg';

  return (
    <PanelProvider panelId={id} width={width} height={height} data={data} timeRange={timeRange} options={options}>
      <div style={{ position: 'relative', height, width, overflow: 'hidden' }}>
        {mode === 'svg' && <SvgModePanel height={height} width={width} />}
        {mode === 'grid' && <GridPanel height={height} width={width} />}
        <UpdatingNotice />
      </div>
    </PanelProvider>
  );
};

export default Panel;
