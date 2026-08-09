import { useMemo } from 'react';
import { PanelOptions } from 'types';
import { buildOrderIndex, sortByOrder } from './groupTraceData';

function wildcardMatch(pattern: string, text: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  const regex = new RegExp('^' + escaped + '$', 'i');
  return regex.test(text);
}

const normalizeDsName = (name: string): string => {
  if (!name) {
    return '';
  }
  let s = name.trim();
  const prefixMatch = s.match(/^(C[A-Z]?\d+)/i);
  if (prefixMatch) {
    s = s.slice(prefixMatch[0].length).trim();
  }
  return s.replace(/\s+/g, ' ');
};

export const useNotificationData = (dsMap: Map<string, Set<string>>, options: PanelOptions['notifyTooltip']) => {
  const { show: enable, excludeFilter, impactJson } = options;

  const orderIndex = useMemo(() => buildOrderIndex(impactJson), [impactJson]);

  const filteredNames = useMemo(() => {
    if (!enable || !dsMap.size) {
      return [];
    }

    const patterns = excludeFilter
      ? excludeFilter
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean)
      : [];

    const pairs: Array<{ original: string; normalized: string }> = [];

    for (const [originalDsName, refIds] of dsMap) {
      if (patterns.length > 0) {
        const allExcluded = Array.from(refIds).every((refId) =>
          patterns.some((pattern) => wildcardMatch(pattern, refId))
        );
        if (allExcluded) {
          continue;
        }
      }

      pairs.push({ original: originalDsName, normalized: normalizeDsName(originalDsName) });
    }

    const sortedPairs = sortByOrder(pairs, orderIndex, (p) => [p.original, p.normalized]);

    return sortedPairs.map((p) => p.normalized);
  }, [dsMap, enable, excludeFilter, orderIndex]);

  const count = filteredNames.length;

  return {
    show: enable && count > 0,
    count,
    dataSourceNames: filteredNames,
  };
};
