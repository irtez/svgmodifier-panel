import { useMemo } from 'react';
import { PanelOptions } from 'types';
import { buildOrderIndex, sortByOrder, normalizeDsName, wildcardMatch } from './domain/traceOrder';
import { EMPTY_STRING_ARRAY } from 'shared/constants';

const EMPTY_RESULT = {
  show: false,
  count: 0,
  dataSourceNames: EMPTY_STRING_ARRAY as string[],
};

export const useNotificationData = (dsMap: Map<string, Set<string>>, options: PanelOptions['notifyTooltip']) => {
  const { show: enable, excludeFilter, impactJson } = options;

  // impactJson может быть довольно большим (полный список ФП с trace_id) —
  // не парсим и не компилируем regex, если тултип вообще выключен из Debug-группы.
  const orderIndex = useMemo(() => (enable ? buildOrderIndex(impactJson) : undefined), [enable, impactJson]);

  // excludeFilter — статичная строка из опций панели, парсим её один раз
  // на изменение самой строки, а не на каждый пересчёт filteredNames.
  const excludePatterns = useMemo(
    () =>
      excludeFilter
        ? excludeFilter
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean)
        : EMPTY_STRING_ARRAY,
    [excludeFilter]
  );

  const filteredNames = useMemo(() => {
    if (!enable || !dsMap.size || !orderIndex) {
      return EMPTY_STRING_ARRAY as string[];
    }

    const pairs: Array<{ original: string; normalized: string }> = [];

    for (const [originalDsName, refIds] of dsMap) {
      if (excludePatterns.length > 0) {
        const allExcluded = Array.from(refIds).every((refId) =>
          excludePatterns.some((pattern) => wildcardMatch(pattern, refId))
        );
        if (allExcluded) {
          continue;
        }
      }

      pairs.push({ original: originalDsName, normalized: normalizeDsName(originalDsName) });
    }

    if (pairs.length === 0) {
      return EMPTY_STRING_ARRAY as string[];
    }

    const sortedPairs = sortByOrder(pairs, orderIndex, (p) => [p.original, p.normalized]);
    return sortedPairs.map((p) => p.normalized);
  }, [dsMap, enable, excludePatterns, orderIndex]);

  // Стабильный "пустой" результат — та же ссылка, если тултип выключен,
  // что даёт React.memo(NotificationTooltip) шанс вообще не перерисоваться.
  if (!enable) {
    return EMPTY_RESULT;
  }

  const count = filteredNames.length;

  return {
    show: count > 0,
    count,
    dataSourceNames: filteredNames,
  };
};
