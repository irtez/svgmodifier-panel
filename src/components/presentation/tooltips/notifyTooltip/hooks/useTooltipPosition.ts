import { useCallback, useLayoutEffect, useState } from 'react';

export interface TooltipPosition {
  left: number;
  top: number;
}

export function useTooltipPosition(
  containerRef: React.RefObject<HTMLElement> | undefined,
  offsetX: number,
  offsetY: number,
  active: boolean
): TooltipPosition {
  const [position, setPosition] = useState<TooltipPosition>({ left: offsetX, top: offsetY });

  const updatePosition = useCallback(() => {
    const panelElement = containerRef?.current;
    if (!panelElement) {
      setPosition({ left: offsetX, top: offsetY });
      return;
    }
    const rect = panelElement.getBoundingClientRect();
    setPosition({ left: rect.left + offsetX, top: rect.top + offsetY });
  }, [containerRef, offsetX, offsetY]);

  useLayoutEffect(() => {
    if (!active) {
      return;
    }

    updatePosition();

    const handleReposition = () => updatePosition();
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);

    return () => {
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [active, updatePosition]);

  return position;
}
