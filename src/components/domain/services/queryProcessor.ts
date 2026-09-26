import { QueriesArray } from './dataHandler';
import { EvaluatedCandidate } from 'components/domain/models';

export interface QuerySelection {
  bestLvl: number;
  winner?: EvaluatedCandidate;
}

export function selectBestQuery(queries: QueriesArray): QuerySelection {
  let bestLvl = Number.NEGATIVE_INFINITY;
  let winner: EvaluatedCandidate | undefined;

  const candidates = [...(queries.fields ?? []), ...(queries.tables ?? [])].sort((a, b) => a.counter - b.counter);
  for (const candidate of candidates) {
    const currentLvl = candidate.lvl ?? Number.NEGATIVE_INFINITY;
    if (Number.isFinite(candidate.metricValue) && currentLvl > bestLvl) {
      bestLvl = currentLvl;
      winner = candidate;
    }
  }

  return { bestLvl, winner };
}
