// Общая утилита создания DOM-портала, вынесена из "общего" hooks.ts, где она
// была перемешана с useAutoScroll (специфичным для этого тултипа хуком).
// usePortal не знает ничего про notifyTooltip — это независимая примитива.

import { useEffect, useRef } from 'react';
import { PORTAL_Z_INDEX } from '../constants';

export const usePortal = (zIndex: number = PORTAL_Z_INDEX) => {
  const portalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = document.createElement('div');
    el.setAttribute('data-testid', 'notify-tooltip-portal');
    el.style.cssText = `position:fixed;top:0;left:0;width:0;height:0;z-index:${zIndex};`;
    portalRef.current = el;
    document.body.appendChild(el);

    return () => {
      portalRef.current?.remove();
      portalRef.current = null;
    };
  }, [zIndex]);

  return portalRef;
};
