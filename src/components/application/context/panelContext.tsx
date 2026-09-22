import React, { createContext, useContext, useMemo, useRef } from 'react';
import { PanelData, TimeRange } from '@grafana/data';
import { PanelOptions } from 'types';
import { usePanelData, ProcessedData } from '../hooks/usePanelData';
import { ConfigRules } from 'components/domain/models';
import type { PreparedPanelConfig } from 'components/infrastructure/config/configSetup';
import { useCaptureSession, useCaptureCommit } from 'components/capture/useCaptureSession';

interface PanelContextType {
  svgRootRef: React.MutableRefObject<SVGElement | null>;
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
  panelId: number;
  width: number;
  height: number;
  data: PanelData;
  timeRange: TimeRange;
  options: PanelOptions;
  children: React.ReactNode;
}

export const PanelProvider: React.FC<PanelProviderProps> = ({
  panelId,
  width,
  height,
  data,
  timeRange,
  options,
  children,
}) => {
  const capture = useCaptureSession(panelId);
  const svgRootRef = useRef<SVGElement | null>(null);
  const { processedData, isLoading, svgDoc, preparedConfig, mappingArray, isCurrentResult } = usePanelData(
    data,
    timeRange,
    options,
    capture
  );
  // Layout effects детей уже применили SVG; grid/invalid SVG завершаются здесь же без ожидания операций.
  useCaptureCommit(isCurrentResult ? processedData?.capture : undefined, svgRootRef, width, height);

  const value = useMemo(
    () => ({
      svgRootRef,
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
