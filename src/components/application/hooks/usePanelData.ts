import { useState, useEffect, useRef, useMemo, useLayoutEffect, type RefObject } from 'react';
import { LoadingState, PanelData, TimeRange } from '@grafana/data';
import { PanelOptions } from 'types';

import { initSVG } from 'components/infrastructure/svg/updater';
import { parsePanelConfig } from 'components/infrastructure/config/parsers';
import { initializeConfig, type PreparedPanelConfig } from 'components/infrastructure/config/configSetup';
import { calculateExpressions } from 'components/domain/utils/calculations';
import { getCustomTimeSettings } from 'components/domain/utils/timeSettings';
import { getDataSourceNames } from 'components/infrastructure/services/dataSourceService';
import { DataFrameMap, Diagnostic, GridContent, PanelEvaluation, TooltipContent } from 'components/domain/models';
import { evaluatePanel } from 'components/domain/services/evaluator';
import { buildPanelPresentation } from 'components/application/adapters/panelPresentation';
import { extractFields } from 'components/infrastructure/data/dataExtractor';

import { configureLogger, logger } from 'shared/logger/logger';
import { EMPTY_DS_MAP } from 'shared/constants';
import type { CaptureConnection, CaptureTicket, CaptureRuntime } from 'components/capture/session';
import type { CapturePublication } from 'components/capture/runtime';
import type { EvaluationTrace } from 'components/capture/trace';

export interface ProcessedData {
  inputKey: object;
  capture?: CapturePublication;
  generation: number;
  timeRange: TimeRange;
  evaluation: PanelEvaluation;
  queriesData: DataFrameMap;
  tooltipContent: TooltipContent[];
  dataSourceMap: Map<string, Set<string>>;
  gridContent: GridContent[] | undefined;
  operations: Array<() => void> | undefined;
}

export const usePanelData = (
  data: PanelData,
  timeRange: TimeRange,
  options: PanelOptions,
  capture?: RefObject<CaptureConnection | null>
) => {
  const generationRef = useRef(0);
  const captureRun = useRef<CaptureTicket>();

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

  const parsedConfig = useMemo(() => parsePanelConfig(metricsMapping), [metricsMapping]);
  const mappingArray = parsedConfig.rules;

  const svgDoc = useMemo(() => {
    if (mode !== 'svg' || !svgCode) {
      return null;
    }
    try {
      return initSVG(svgCode, svgAspectRatio);
    } catch (err) {
      logger.debug('initSVG threw', err, 'svg');
      return null;
    }
  }, [mode, svgCode, svgAspectRatio]);
  // После mount корень перенесён из XML Document в DOM; сохраняем его для нового YAML.
  const svgRoot = useMemo(() => svgDoc?.documentElement ?? null, [svgDoc]);

  const preparedConfig = useMemo<PreparedPanelConfig>(() => {
    if (mode === 'svg' && !svgDoc) {
      return {
        rulesByElementId: new Map(),
        elementsById: new Map(),
        diagnostics: [
          { code: 'INVALID_SVG', severity: 'error', message: 'SVG отсутствует или не может быть разобран' },
        ],
      };
    }
    return initializeConfig(svgRoot, mappingArray);
  }, [mode, svgDoc, svgRoot, mappingArray]);

  const transformationsExpressions = options.transformations.expressions;
  const inputKey = useMemo(
    () => ({
      token: {},
      svgCode,
      svgDoc,
      mappingArray,
      mode,
      data,
      timeRange,
      parsedConfig,
      preparedConfig,
      customTimeSettings,
      calculateOptions,
      notifyShow,
      transformationsExpressions,
      capture,
    }),
    [
      svgCode,
      svgDoc,
      mappingArray,
      mode,
      data,
      timeRange,
      parsedConfig,
      preparedConfig,
      customTimeSettings,
      calculateOptions,
      notifyShow,
      transformationsExpressions,
      capture,
    ]
  );

  useLayoutEffect(() => {
    const generation = ++generationRef.current;
    captureRun.current = capture?.current?.begin({
      effectiveFromMs: timeRange.from.valueOf(),
      effectiveToMs: timeRange.to.valueOf(),
    });
    return () => {
      generationRef.current = generation + 1;
    };
  }, [inputKey, capture, timeRange]);

  useEffect(() => {
    const generation = generationRef.current;
    const ticket = captureRun.current;
    const isCurrent = () => generationRef.current === generation;
    setIsLoading(true);

    // Grafana может передать предыдущие series, пока следующий запрос ещё выполняется.
    if (data.state === LoadingState.Loading || data.state === LoadingState.NotStarted) {
      return;
    }

    const process = async () => {
      const diagnostics: Diagnostic[] = [...parsedConfig.diagnostics, ...(preparedConfig.diagnostics ?? [])];
      let queriesData: DataFrameMap = new Map();
      let runtime: CaptureRuntime | null = null;
      let trace: EvaluationTrace | undefined;
      let failed = false;
      if (ticket) {
        if (data.state !== LoadingState.Done && data.state !== LoadingState.Error) {
          ticket.fail('CAPTURE_DATA_STATE_UNSUPPORTED');
        } else {
          runtime = await ticket.load();
          if (!isCurrent()) {
            return;
          }
          if (runtime) {
            try {
              trace = runtime.createTrace(mappingArray, preparedConfig, () => ticket.fail());
            } catch {
              ticket.fail();
              runtime = null;
            }
          }
        }
      }
      const publication = (evaluation: PanelEvaluation): CapturePublication | undefined => {
        if (!runtime || !trace || !ticket?.current()) {
          return undefined;
        }
        try {
          return runtime.createPublication(
            ticket,
            {
              trace,
              evaluation,
              producerVersion: ticket.connection.producerVersion,
              panel: { id: ticket.connection.panelId, title: null, mode },
              observed: {
                dataState: data.state as 'Done' | 'Error',
                effectiveFromMs: timeRange.from.valueOf(),
                effectiveToMs: timeRange.to.valueOf(),
                evaluatedAtMs: Date.now(),
              },
              evaluationStatus: failed
                ? 'failed'
                : parsedConfig.status === 'invalid' || (mode === 'svg' && !svgDoc)
                ? 'invalid_configuration'
                : 'evaluated',
              configuration: {
                yamlStatus: parsedConfig.status,
                svgStatus: mode !== 'svg' ? 'not_evaluated' : !svgCode ? 'empty' : svgDoc ? 'ready' : 'invalid',
              },
            },
            svgCode ?? ''
          );
        } catch {
          ticket.fail();
          return undefined;
        }
      };
      try {
        const errors = data.errors?.length ? data.errors : data.error ? [data.error] : [];
        const failedRefs = new Set(errors.map((error) => error.refId).filter(Boolean));
        const unknownFailure =
          errors.some((error) => !error.refId) || (data.state === LoadingState.Error && !errors.length);
        for (const error of errors) {
          diagnostics.push({
            code: 'QUERY_ERROR',
            severity: 'error',
            message: `Ошибка запроса: ${error.message}`,
            source: { refId: error.refId },
          });
        }
        if (unknownFailure && !errors.length) {
          diagnostics.push({ code: 'QUERY_ERROR', severity: 'error', message: 'Не удалось получить данные панели' });
        }
        const currentData = {
          ...data,
          series: unknownFailure ? [] : data.series.filter((frame) => !failedRefs.has(frame.refId)),
        };
        const rawQueriesData = await extractFields(currentData, customTimeSettings, timeRange, trace);
        if (!isCurrent()) {
          return;
        }

        if (notifyShow) {
          // Имя — метаданные, его недоступность не должна отменять сами расчёты.
          try {
            await getDataSourceNames(currentData, rawQueriesData);
          } catch (error) {
            diagnostics.push({
              code: 'DATASOURCE_NAME_ERROR',
              severity: 'warning',
              message: 'Не удалось получить имя источника данных',
            });
          }
        }
        if (!isCurrent()) {
          return;
        }
        queriesData = await calculateExpressions(
          transformationsExpressions,
          rawQueriesData,
          timeRange,
          diagnostics,
          trace
        );
      } catch (error) {
        failed = true;
        diagnostics.push({
          code: 'CALCULATION_ERROR',
          severity: 'error',
          message: `Ошибка обработки данных: ${error instanceof Error ? error.message : String(error)}`,
        });
        logger.error('usePanelData.process() failed', error, 'data');
      }
      if (!isCurrent()) {
        return;
      }
      try {
        const evaluation = evaluatePanel(
          preparedConfig.rulesByElementId,
          queriesData,
          {
            timeTo: timeRange.to.valueOf(),
            diagnostics,
          },
          trace
        );
        const result = buildPanelPresentation(evaluation, preparedConfig.elementsById, calculateOptions);
        if (isCurrent()) {
          setProcessedData({
            inputKey: inputKey.token,
            capture: publication(evaluation),
            generation,
            timeRange,
            evaluation,
            queriesData,
            tooltipContent: result.tooltipContent || [],
            dataSourceMap: result.dataSourceMap || EMPTY_DS_MAP,
            operations: result.operations,
            gridContent: result.gridContent,
          });
        }
      } catch (err) {
        failed = true;
        // Даже непредусмотренная ошибка не оставляет старый успех текущим результатом.
        diagnostics.push({
          code: 'EVALUATION_ERROR',
          severity: 'error',
          message: `Ошибка оценки панели: ${err instanceof Error ? err.message : String(err)}`,
        });
        const evaluation: PanelEvaluation = { elements: [], diagnostics };
        const reset = buildPanelPresentation(evaluation, preparedConfig.elementsById, calculateOptions);
        setProcessedData({
          inputKey: inputKey.token,
          capture: publication(evaluation),
          generation,
          timeRange,
          evaluation,
          queriesData,
          tooltipContent: [],
          dataSourceMap: EMPTY_DS_MAP,
          operations: reset.operations,
          gridContent: [],
        });
      } finally {
        if (isCurrent()) {
          setIsLoading(false);
        }
      }
    };

    process();
  }, [
    data,
    timeRange,
    parsedConfig,
    preparedConfig,
    customTimeSettings,
    calculateOptions,
    notifyShow,
    transformationsExpressions,
    inputKey,
    mappingArray,
    mode,
    svgCode,
    svgDoc,
  ]);

  return {
    processedData,
    isLoading,
    svgDoc,
    preparedConfig,
    mappingArray,
    isCurrentResult: processedData?.inputKey === inputKey.token,
  };
};
