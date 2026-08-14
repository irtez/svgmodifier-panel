import { useLayoutEffect, useRef, useState } from 'react';
import { MAX_TOOLTIP_WIDTH, TOOLTIP_WIDTH_STEP, INITIAL_TOOLTIP_WIDTH } from '../constants';

export interface AdaptiveWidthResult {
  textRef: React.RefObject<HTMLDivElement>;
  tooltipWidth: number;
  needsScroll: boolean;
}

/**
 * Постепенно увеличивает ширину контейнера (шагами TOOLTIP_WIDTH_STEP), пока
 * контент не перестанет обрезаться по высоте, либо пока не достигнут
 * MAX_TOOLTIP_WIDTH — тогда включается needsScroll (список станет скроллящимся,
 * см. useAutoScroll).
 */
export function useAdaptiveWidth(active: boolean, dataSourceNames: readonly string[]): AdaptiveWidthResult {
  const textRef = useRef<HTMLDivElement>(null);
  const [tooltipWidth, setTooltipWidth] = useState(INITIAL_TOOLTIP_WIDTH);
  const [needsScroll, setNeedsScroll] = useState(false);

  useLayoutEffect(() => {
    if (!active) {
      setNeedsScroll(false);
      return;
    }

    const el = textRef.current;
    if (!el) {
      return;
    }

    const checkOverflow = () => {
      if (!textRef.current) {
        return;
      }
      const isClipped = textRef.current.scrollHeight - textRef.current.clientHeight > 2;
      const isMaxWidth = tooltipWidth >= MAX_TOOLTIP_WIDTH;

      if (isClipped && !isMaxWidth) {
        setTooltipWidth((prev) => Math.min(prev + TOOLTIP_WIDTH_STEP, MAX_TOOLTIP_WIDTH));
        setNeedsScroll(false);
      } else if (isMaxWidth && isClipped) {
        setNeedsScroll(true);
      } else {
        setNeedsScroll(false);
      }
    };

    checkOverflow();
    const observer = new ResizeObserver(checkOverflow);
    observer.observe(el);
    return () => observer.disconnect();
  }, [active, dataSourceNames, tooltipWidth]);

  return { textRef, tooltipWidth, needsScroll };
}
