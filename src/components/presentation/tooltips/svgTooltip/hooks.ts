import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TooltipContent } from 'components/domain/models';
import { processTooltipContent } from './utils';
import { PanelOptions } from 'types';

interface PinnedTooltip {
  id: string; // уникальный id для React
  elementId: string; // id элемента DOM, к которому привязан (важно!)
  content: TooltipContent;
  x: number;
  y: number;
}

export const useTooltipLogic = (
  tooltipData: TooltipContent[],
  containerRef: React.RefObject<HTMLDivElement>,
  options: PanelOptions['tooltip']
) => {
  const isMounted = useRef(true);
  const tooltipDataRef = useRef<TooltipContent[]>([]);
  const [hoverTooltip, setHoverTooltip] = useState<{
    id: string;
    content: TooltipContent;
    x: number;
    y: number;
  } | null>(null);
  const [pinnedTooltips, setPinnedTooltips] = useState<PinnedTooltip[]>([]);
  const [adjustedCoords, setAdjustedCoords] = useState<Record<string, { x: number; y: number }>>({});
  const [adjustedHoverCoords, setAdjustedHoverCoords] = useState<{ x: number; y: number } | null>(null);
  const lastAdjustedHoverCoords = useRef<{ x: number; y: number } | null>(null);

  tooltipDataRef.current = tooltipData;

  // Подсказка показывает актуальный результат панели даже без нового движения мыши.
  useEffect(() => {
    setPinnedTooltips((prev) =>
      prev.flatMap((pinned) => {
        const freshData = tooltipDataRef.current.find((td) => td.id === pinned.elementId);
        if (!freshData) {
          return [];
        }
        const newContent = processTooltipContent(freshData, options);
        if (!newContent) {
          return [];
        }
        // Сравниваем содержимое (глубокое сравнение – простой JSON.stringify подойдёт)
        if (JSON.stringify(newContent) === JSON.stringify(pinned.content)) {
          return [pinned];
        }
        return [{ ...pinned, content: newContent }];
      })
    );
    setHoverTooltip((previous) => {
      if (!previous) {
        return null;
      }
      const content = processTooltipContent(
        tooltipData.find((item) => item.id === previous.id),
        options
      );
      if (!content) {
        return null;
      }
      return JSON.stringify(content) === JSON.stringify(previous.content) ? previous : { ...previous, content };
    });
  }, [tooltipData, options]);

  const hideHover = useCallback(() => {
    if (!isMounted.current) {
      return;
    }
    setHoverTooltip(null);
    setAdjustedHoverCoords(null);
    lastAdjustedHoverCoords.current = null;
  }, []);

  const pin = useCallback((elementId: string, content: TooltipContent, x: number, y: number) => {
    if (!isMounted.current) {
      return;
    }
    setPinnedTooltips((prev) => {
      if (prev.some((p) => p.elementId === elementId)) {
        return prev;
      }
      const uniqueId = `${Date.now()}-${elementId}`;
      return [...prev, { id: uniqueId, elementId, content, x, y }];
    });
  }, []);

  const unpin = useCallback((id: string) => {
    if (!isMounted.current) {
      return;
    }
    setPinnedTooltips((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const unpinAll = useCallback(() => {
    if (!isMounted.current) {
      return;
    }
    setPinnedTooltips([]);
  }, []);

  const handleMouseOver = useCallback(
    (e: MouseEvent) => {
      if (!isMounted.current) {
        return;
      }
      const target = e.target as Element | null;
      if (!target) {
        return;
      }

      let current: Element | null = target;
      while (current && current !== containerRef.current) {
        const id = current.id;
        if (id) {
          if (pinnedTooltips.some((p) => p.elementId === id)) {
            return;
          }
          const metric = tooltipDataRef.current.find((td) => td.id === id);
          if (metric) {
            const content = processTooltipContent(metric, options);
            if (content) {
              setHoverTooltip({
                id: current.id,
                content,
                x: e.clientX + 10,
                y: e.clientY,
              });
            }
            return;
          }
        }
        current = current.parentElement;
      }
      hideHover();
    },
    [containerRef, options, pinnedTooltips, hideHover]
  );

  const handleMouseOut = useCallback(
    (e: MouseEvent) => {
      if (!isMounted.current) {
        return;
      }
      const related = e.relatedTarget as Node | null;
      if (!containerRef.current?.contains(related)) {
        hideHover();
      }
    },
    [containerRef, hideHover]
  );

  const handleContextMenu = useCallback(
    (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) {
        return;
      }
      let current: Element | null = target;
      while (current && current !== containerRef.current) {
        const elementId = current.id;
        if (elementId) {
          const metric = tooltipDataRef.current.find((td) => td.id === elementId);
          if (metric) {
            e.preventDefault();
            if (pinnedTooltips.some((p) => p.elementId === elementId)) {
              hideHover();
              // Находим id pinned-тултипа по elementId и удаляем
              const pinned = pinnedTooltips.find((p) => p.elementId === elementId);
              if (pinned) {
                unpin(pinned.id);
              }
              return;
            }
            const content = processTooltipContent(metric, options);
            if (content) {
              let x = e.clientX + 10;
              let y = e.clientY;
              if (hoverTooltip && hoverTooltip.id === elementId) {
                if (lastAdjustedHoverCoords.current) {
                  x = lastAdjustedHoverCoords.current.x;
                  y = lastAdjustedHoverCoords.current.y;
                } else {
                  x = hoverTooltip.x;
                  y = hoverTooltip.y;
                }
              }
              hideHover();
              pin(elementId, content, x, y);
            }
            return;
          }
        }
        current = current.parentElement;
      }
    },
    [containerRef, options, pinnedTooltips, hoverTooltip, pin, unpin, hideHover]
  );

  const handleDocumentClick = useCallback(
    (e: MouseEvent) => {
      if (!pinnedTooltips.length) {
        return;
      }
      const target = e.target as Node | null;
      if (!target) {
        return;
      }

      const clickedInsideTooltip = pinnedTooltips.some((p) => {
        const tooltipEl = document.querySelector(`[data-tooltip-id="${p.id}"]`);
        return tooltipEl && tooltipEl.contains(target);
      });
      if (clickedInsideTooltip) {
        return;
      }

      let current = target as Element | null;
      let clickedOnTarget = false;
      while (current && current !== containerRef.current) {
        const id = current.id;
        if (id && pinnedTooltips.some((p) => p.elementId === id)) {
          clickedOnTarget = true;
          break;
        }
        current = current.parentElement;
      }
      if (clickedOnTarget) {
        return;
      }

      unpinAll();
    },
    [pinnedTooltips, containerRef, unpinAll]
  );

  const adjustTooltipPosition = useCallback((el: HTMLDivElement | null, x: number, y: number) => {
    if (!el) {
      return { x, y };
    }
    const rect = el.getBoundingClientRect();
    let newX = x;
    let newY = y;
    if (newX + rect.width > window.innerWidth) {
      newX = x - rect.width - 10;
    }
    if (newX < 0) {
      newX = 10;
    }
    if (newY + rect.height > window.innerHeight) {
      newY = window.innerHeight - rect.height - 10;
    }
    if (newY < 0) {
      newY = 10;
    }
    return { x: newX, y: newY };
  }, []);

  // Коррекция pinned
  useLayoutEffect(() => {
    if (!pinnedTooltips.length) {
      setAdjustedCoords({});
      return;
    }
    const newCoords: Record<string, { x: number; y: number }> = {};
    for (const p of pinnedTooltips) {
      const el = document.querySelector(`[data-tooltip-id="${p.id}"]`) as HTMLDivElement;
      if (el) {
        newCoords[p.id] = adjustTooltipPosition(el, p.x, p.y);
      }
    }
    if (isMounted.current) {
      setAdjustedCoords(newCoords);
    }
  }, [pinnedTooltips, adjustTooltipPosition]);

  // Коррекция hover и сохранение в ref
  useLayoutEffect(() => {
    if (!hoverTooltip) {
      setAdjustedHoverCoords(null);
      lastAdjustedHoverCoords.current = null;
      return;
    }
    const el = document.querySelector(`[data-tooltip-id="${hoverTooltip.id}"]`) as HTMLDivElement;
    if (el) {
      const corrected = adjustTooltipPosition(el, hoverTooltip.x, hoverTooltip.y);
      setAdjustedHoverCoords(corrected);
      lastAdjustedHoverCoords.current = corrected;
    }
  }, [hoverTooltip, adjustTooltipPosition]);

  useEffect(() => {
    isMounted.current = true;
    const container = containerRef.current;
    if (!container) {
      return;
    }

    container.addEventListener('mouseover', handleMouseOver as EventListener);
    container.addEventListener('mouseout', handleMouseOut as EventListener);
    container.addEventListener('contextmenu', handleContextMenu as EventListener);
    document.addEventListener('click', handleDocumentClick as EventListener);

    return () => {
      isMounted.current = false;
      container.removeEventListener('mouseover', handleMouseOver as EventListener);
      container.removeEventListener('mouseout', handleMouseOut as EventListener);
      container.removeEventListener('contextmenu', handleContextMenu as EventListener);
      document.removeEventListener('click', handleDocumentClick as EventListener);
    };
  }, [containerRef, handleMouseOver, handleMouseOut, handleContextMenu, handleDocumentClick]);

  return {
    hoverTooltip,
    pinnedTooltips,
    adjustedCoords,
    adjustedHoverCoords,
    unpin,
    unpinAll,
  };
};
