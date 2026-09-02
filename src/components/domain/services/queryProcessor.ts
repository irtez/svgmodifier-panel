import { QueriesArray } from './dataHandler';
import { EvaluatedCandidate } from 'components/domain/models';

export interface QuerySelection {
  bestLvl: number;
  bestMetric: number;
  winner?: EvaluatedCandidate;
}

export function selectBestQuery(queries: QueriesArray): QuerySelection {
  let bestLvl = Number.NEGATIVE_INFINITY;
  let bestMetric = Number.NEGATIVE_INFINITY;
  let winner: EvaluatedCandidate | undefined;

  for (const field of queries.fields ?? []) {
    const currentLvl = field.lvl ?? Number.NEGATIVE_INFINITY;
    const currentMetric = field.metricValue ?? Number.NEGATIVE_INFINITY;

    if (currentLvl > bestLvl || (currentLvl === bestLvl && currentMetric > bestMetric)) {
      bestLvl = currentLvl;
      bestMetric = currentMetric;
      winner = field;
    }
  }

  for (const table of queries.tables ?? []) {
    const currentLvl = table.lvl ?? Number.NEGATIVE_INFINITY;

    if (currentLvl > bestLvl || (currentLvl === bestLvl && !bestMetric)) {
      bestLvl = currentLvl;
      winner = table;
    }
  }

  return { bestLvl, bestMetric, winner };
}
