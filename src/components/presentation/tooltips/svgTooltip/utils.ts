import { TimeRange } from '@grafana/data';
import { PanelOptions } from 'types';
import { TooltipContent } from 'components/domain/models';

/**
 * time for tooltip header
 */
export const formatTimeRange = (timeRange: TimeRange): string => {
  const to = new Date(timeRange.to.valueOf());

  const formatTime = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  };

  return `${formatTime(to)}`;
};

/**
 * Применение параметров Tooltip options
 */
export const processTooltipContent = (
  content: TooltipContent | undefined,
  options: PanelOptions['tooltip']
): TooltipContent | undefined => {
  if (!content) {
    return undefined;
  }
  content = { ...content, queryData: content.queryData ? [...content.queryData] : undefined };

  // Фильтрация нулей в queryData
  if (options.hideZeros && content.queryData) {
    content.queryData = content.queryData.filter((metric) => {
      const numericValue = parseFloat(metric.metric);
      return !isNaN(numericValue) && numericValue !== 0;
    });
  }

  // Сортировка queryData
  if (options.sort !== 'none' && content.queryData) {
    content.queryData.sort((a, b) => {
      const aValue = parseFloat(a.metric || '0');
      const bValue = parseFloat(b.metric || '0');
      return isNaN(aValue) || isNaN(bValue) ? 0 : options.sort === 'ascending' ? aValue - bValue : bValue - aValue;
    });
  }

  // Обработка текстов
  content.textAbove = content.textAbove ? getLines(content.textAbove) : undefined;
  content.textBelow = content.textBelow ? getLines(content.textBelow) : undefined;

  return content;
};

/**
 * Извлекает уникальные строки из textAbove/textBelow
 */
const getLines = (content: string | string[]): string[] => {
  if (typeof content !== 'string') {
    return content;
  }

  const lines = content
    .replace(/\\n/g, '\n') // заменяем экранированные \n
    .split('\n') // разбиваем по реальным переносам
    .map((line) => line.trim()) // убираем пробелы по краям
    .filter((line) => line !== ''); // убираем пустые строки

  return lines;
};
