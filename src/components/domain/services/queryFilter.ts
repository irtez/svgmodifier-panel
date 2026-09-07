import { QueriesArray } from '../../domain/services/dataHandler';

export function queriesFilter(
  queries: QueriesArray,
  selector: number[] | undefined,
  index: number,
  elemsLength: number,
  autoConfig?: boolean
): QueriesArray {
  if (queries.slots) {
    let slots = queries.slots;
    if (selector?.length) {
      slots = slots.filter((slot) => selector.includes(slot.counter));
    } else if (autoConfig) {
      // Сохраняем прежнюю раскладку: fields и tables индексируются отдельно.
      // Неудачный query занимает место, хотя числового результата у него нет.
      const take = (items: typeof slots) =>
        index === elemsLength - 1 ? items.slice(index) : items.slice(index, index + 1);
      const selected = new Set([
        ...take(slots.filter((slot) => slot.kind !== 'table')),
        ...take(slots.filter((slot) => slot.kind !== 'field')),
      ]);
      slots = slots.filter((slot) => selected.has(slot));
    }
    return {
      slots,
      fields: slots.flatMap((slot) => (slot.candidate && !('columnsData' in slot.candidate) ? [slot.candidate] : [])),
      tables: slots.flatMap((slot) => (slot.candidate && 'columnsData' in slot.candidate ? [slot.candidate] : [])),
    };
  }
  const fieldsLength = queries.fields?.length || 0;
  const tablesLength = queries.tables?.length || 0;
  const metricsLength = fieldsLength + tablesLength;

  if (metricsLength === 0) {
    return queries;
  }

  if (selector && selector.length > 0) {
    const selectorSet = new Set(selector);

    return {
      fields: queries.fields?.filter((item) => selectorSet.has(item.counter)),
      tables: queries.tables?.filter((item) => selectorSet.has(item.counter)),
    };
  }

  if (autoConfig === true) {
    const keepCounters = new Set<number>();

    if (metricsLength === elemsLength) {
      keepCounters.add(index + 1);
    } else if (metricsLength < elemsLength) {
      if (index < metricsLength) {
        keepCounters.add(index + 1);
      }
    } else {
      const lastIndex = elemsLength - 1;
      if (index < lastIndex) {
        keepCounters.add(index + 1);
      } else {
        for (let c = elemsLength - 1; c < metricsLength; c++) {
          keepCounters.add(c + 1);
        }
      }
    }

    return {
      fields: queries.fields?.filter((_, idx) => keepCounters.has(idx + 1)),
      tables: queries.tables?.filter((_, idx) => keepCounters.has(idx + 1)),
    };
  }

  return queries;
}
