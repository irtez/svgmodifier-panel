import { QuerySpecificSettings, Metrics, ValueMapping } from 'components/domain/models';

type EffectiveSettings = QuerySpecificSettings & {
  decimal: number;
  filling: string;
  calculation: NonNullable<QuerySpecificSettings['calculation']>;
  mapping?: ValueMapping[];
};

export const defaultConfig: EffectiveSettings = {
  filter: undefined,
  sum: undefined,
  label: undefined,
  unit: undefined,
  title: undefined,
  decimal: 2,
  filling: 'fill' as const,
  baseColor: undefined,
  calculation: 'last' as const,
  thresholdKey: undefined,
  thresholds: undefined,
  dataSourceName: undefined,
  mapping: undefined as ValueMapping[] | undefined,
};

export const getConfig = (queryConfig: QuerySpecificSettings, metricConfig: Metrics, mapping?: ValueMapping[]) => {
  return Object.fromEntries(
    Object.entries(defaultConfig).map(([key, defaultValue]) => {
      const typedKey = key as keyof typeof defaultConfig;

      if (key === 'mapping') {
        return [key, mapping ?? defaultValue];
      }

      const fromQuery = queryConfig[typedKey as keyof QuerySpecificSettings];
      const fromMetric = typedKey in metricConfig ? (metricConfig as Record<string, any>)[typedKey] : undefined;

      return [key, fromQuery ?? fromMetric ?? defaultValue];
    })
  ) as EffectiveSettings;
};
