import { useState, useEffect, useRef, useMemo } from 'react';
import { PanelData, TimeRange } from '@grafana/data';
import { PanelOptions } from 'types';

import { initSVG } from 'components/infrastructure/svg/updater';
import { parseYamlConfig } from 'components/infrastructure/config/parsers';
import { initializeConfig } from 'components/infrastructure/config/configSetup';
import { calculateExpressions } from 'components/domain/utils/calculations';
import { getCustomTimeSettings } from 'components/domain/utils/timeSettings';
import { getDataSourceNames } from 'components/infrastructure/services/dataSourceService';
import { TooltipContent } from 'components/domain/models';
import { processor } from 'components/domain/services/processor';
import { extractFields } from 'components/infrastructure/data/dataExtractor';

import { configureLogger, logger } from 'shared/logger/logger';
import { errorStore } from 'shared/errors/errorStore';
import { AppError, ConfigError } from 'shared/errors/AppError';
import { EMPTY_DS_MAP } from 'shared/constants';

export interface ProcessedData {
  queriesData: Map<string, any>;
  tooltipContent: TooltipContent[];
  dataSourceMap: Map<string, Set<string>>;
  gridContent: any;
  operations: any;
}

export const usePanelData = (data: PanelData, timeRange: TimeRange, options: PanelOptions) => {
  const countQueries = useRef(0);
  const isActiveRef = useRef(false);

  const [isLoading, setIsLoading] = useState(false);
  const [processedData, setProcessedData] = useState<ProcessedData | null>(null);

  const { svgCode, metricsMapping, svgAspectRatio, customRelativeTime, fieldsCustomRelativeTime } = options.jsonData;

  const mode = options.displayMode || 'svg';
  const notifyShow = options.notifyTooltip.show && (options.debug?.enableNotifyTooltip ?? true);
  const notifyThreshold = options.notifyTooltip.threshold;

  useEffect(() => {
    configureLogger({
      enabled: options.debug?.loggingEnabled ?? false,
      level: options.debug?.logLevel ?? 'warn',
    });
  }, [options.debug?.loggingEnabled, options.debug?.logLevel]);

  const calculateOptions = useMemo(
    () => ({
      mode,
      notifySettings: {
        show: notifyShow,
        threshold: notifyThreshold,
      },
    }),
    [mode, notifyShow, notifyThreshold]
  );

  const customTimeSettings = useMemo(
    () => getCustomTimeSettings(customRelativeTime, fieldsCustomRelativeTime),
    [customRelativeTime, fieldsCustomRelativeTime]
  );

  const mappingArray = useMemo(() => {
    try {
      return parseYamlConfig(metricsMapping);
    } catch (err) {
      errorStore.report(
        new ConfigError('Не удалось разобрать YAML-конфигурацию панели', {
          cause: err instanceof Error ? err.message : err,
        })
      );
      logger.debug('parseYamlConfig threw', err, 'config');
      return null;
    }
  }, [metricsMapping]);

  const svgDoc = useMemo(() => {
    if (mode !== 'svg' || !svgCode) {
      return null;
    }
    try {
      return initSVG(svgCode, svgAspectRatio);
    } catch (err) {
      errorStore.report(
        new AppError('svg', 'Не удалось разобрать SVG-код панели', {
          cause: err instanceof Error ? err.message : err,
        })
      );
      logger.debug('initSVG threw', err, 'svg');
      return null;
    }
  }, [mode, svgCode, svgAspectRatio]);

  const configMap = useMemo(() => {
    try {
      return initializeConfig(svgDoc, mappingArray);
    } catch (err) {
      errorStore.report(
        new ConfigError('Не удалось сопоставить конфигурацию с элементами SVG', {
          cause: err instanceof Error ? err.message : err,
        })
      );
      logger.debug('initializeConfig threw', err, 'config');
      return new Map();
    }
  }, [svgDoc, mappingArray]);

  useEffect(() => {
    errorStore.clear();
  }, [svgCode, metricsMapping]);

  const transformationsExpressions = options.transformations.expressions;

  useEffect(() => {
    isActiveRef.current = true;
    setIsLoading(true);

    const process = async () => {
      try {
        const rawQueriesData = await extractFields(data, customTimeSettings, timeRange);

        if (notifyShow && rawQueriesData.size !== countQueries.current) {
          await getDataSourceNames(data, rawQueriesData);
          countQueries.current = rawQueriesData.size;
        }

        if (!isActiveRef.current) {
          return;
        }

        const queriesData = await calculateExpressions(transformationsExpressions, rawQueriesData, timeRange);
        const result = await processor(configMap, queriesData, calculateOptions);

        if (result && isActiveRef.current) {
          setProcessedData({
            queriesData,
            tooltipContent: result.tooltip || [],
            dataSourceMap: result.dataSourceMap || EMPTY_DS_MAP,
            operations: result.operations,
            gridContent: result.gridContent,
          });
        }
      } catch (err) {
        errorStore.report(
          err instanceof AppError
            ? err
            : new AppError('data', 'Ошибка обработки данных панели', {
                cause: err instanceof Error ? err.message : err,
              })
        );
        logger.error('usePanelData.process() failed', err, 'data');
      } finally {
        if (isActiveRef.current) {
          setIsLoading(false);
        }
      }
    };

    process();
    return () => {
      isActiveRef.current = false;
    };
  }, [data, timeRange, configMap, customTimeSettings, calculateOptions, notifyShow, transformationsExpressions]);

  return {
    processedData,
    isLoading,
    svgDoc,
    configMap,
    mappingArray,
  };
};
