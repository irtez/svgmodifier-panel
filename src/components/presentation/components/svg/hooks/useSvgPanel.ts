import { useLayoutEffect, useRef } from 'react';
import { updateSvg } from 'components/infrastructure/svg/updater';
import { ProcessedData } from 'components/application/hooks/usePanelData';

export function useSvgMount(
  containerRef: React.RefObject<HTMLDivElement>,
  svgDoc: Document | null
): React.RefObject<SVGElement | null> {
  const mountedRootRef = useRef<SVGElement | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    container.innerHTML = '';
    mountedRootRef.current = null;

    if (!svgDoc) {
      return;
    }

    const rootEl = svgDoc.documentElement as unknown as SVGElement;
    container.appendChild(rootEl);
    mountedRootRef.current = rootEl;

    return () => {
      if (rootEl.parentNode === container) {
        container.removeChild(rootEl);
      }
      mountedRootRef.current = null;
    };
  }, [containerRef, svgDoc]);

  return mountedRootRef;
}

export function useSvgUpdates(
  processedData: ProcessedData | null,
  mountedRootRef: React.RefObject<SVGElement | null>
): void {
  useLayoutEffect(() => {
    if (processedData?.operations) {
      updateSvg(processedData.operations, mountedRootRef.current);
    }
  }, [processedData, mountedRootRef]);
}
