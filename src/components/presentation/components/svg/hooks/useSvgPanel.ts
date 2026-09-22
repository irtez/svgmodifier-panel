import { useLayoutEffect, useRef, useMemo } from 'react';
import { updateSvg } from 'components/infrastructure/svg/updater';
import { ProcessedData } from 'components/application/hooks/usePanelData';

export function useSvgMount(
  containerRef: React.RefObject<HTMLDivElement>,
  svgDoc: Document | null,
  externalRoot?: React.MutableRefObject<SVGElement | null>
): React.RefObject<SVGElement | null> {
  const internalRootRef = useRef<SVGElement | null>(null);
  const mountedRootRef = externalRoot ?? internalRootRef;
  const rootEl = useMemo(() => svgDoc?.documentElement as unknown as SVGElement | null, [svgDoc]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    container.innerHTML = '';
    mountedRootRef.current = null;

    if (!rootEl) {
      return;
    }

    container.appendChild(rootEl);
    mountedRootRef.current = rootEl;

    return () => {
      if (rootEl.parentNode === container) {
        container.removeChild(rootEl);
      }
      mountedRootRef.current = null;
    };
  }, [containerRef, rootEl, mountedRootRef]);

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
