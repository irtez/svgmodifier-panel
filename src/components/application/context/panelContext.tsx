import React, { createContext, useContext, useMemo } from 'react';
import { PanelData, TimeRange } from '@grafana/data';
import { PanelOptions } from 'types';
import { usePanelData, ProcessedData } from '../hooks/usePanelData';
import { ConfigRules } from 'components/domain/models';
import type { PreparedPanelConfig } from 'components/infrastructure/config/configSetup';

interface PanelContextType {
  isLoading: boolean;
  svgDoc: Document | null;
  preparedConfig: PreparedPanelConfig;
  mappingArray: ConfigRules[] | null;
  processedData: ProcessedData | null;
  options: PanelOptions;
  timeRange: TimeRange;
}

const PanelContext = createContext<PanelContextType | undefined>(undefined);

export const usePanelContext = () => {
  const context = useContext(PanelContext);
  if (!context) {
    throw new Error('usePanelContext must be used within PanelProvider');
  }
  return context;
};

interface PanelProviderProps {
  data: PanelData;
  timeRange: TimeRange;
  options: PanelOptions;
  children: React.ReactNode;
}

export const PanelProvider: React.FC<PanelProviderProps> = ({ data, timeRange, options, children }) => {
  const { processedData, isLoading, svgDoc, preparedConfig, mappingArray } = usePanelData(data, timeRange, options);

  const value = useMemo(
    () => ({
      processedData,
      isLoading,
      svgDoc,
      preparedConfig,
      mappingArray,
      options,
      timeRange,
    }),
    [processedData, isLoading, svgDoc, preparedConfig, mappingArray, options, timeRange]
  );

  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
};
