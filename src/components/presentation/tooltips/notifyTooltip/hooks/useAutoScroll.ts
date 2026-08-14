import { useEffect, useRef } from 'react';
import {
  AUTO_SCROLL_START_DELAY_MS,
  AUTO_SCROLL_DOWN_DURATION_MS,
  AUTO_SCROLL_PAUSE_AT_BOTTOM_MS,
  AUTO_SCROLL_UP_DURATION_MS,
} from '../constants';

/** Плавный скролл к target с поддержкой отмены через cancelRef */
function smoothScrollTo(
  element: HTMLElement,
  target: number,
  duration: number,
  cancelRef: React.MutableRefObject<boolean>
): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = element.scrollTop;
    const change = target - start;

    if (Math.abs(change) < 0.5) {
      resolve();
      return;
    }

    const startTime = performance.now();

    const step = (now: number) => {
      if (cancelRef.current) {
        reject(new Error('cancelled'));
        return;
      }
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      element.scrollTop = start + change * ease;

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        resolve();
      }
    };

    requestAnimationFrame(step);
  });
}

/**
 * Автоскролл длинного списка datasource: пауза → скролл вниз → пауза внизу →
 * скролл наверх. Полностью отменяется при размонтировании/смене данных.
 */
export const useAutoScroll = (
  containerRef: React.RefObject<HTMLDivElement>,
  needsScroll: boolean,
  dataSourceNames: readonly string[]
): void => {
  const isAutoScrolling = useRef(false);
  const cancelRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!needsScroll || !el || isAutoScrolling.current) {
      return;
    }

    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 0) {
      return;
    }

    const timeout = setTimeout(async () => {
      if (cancelRef.current || !containerRef.current || isAutoScrolling.current) {
        return;
      }
      isAutoScrolling.current = true;
      cancelRef.current = false;

      try {
        await smoothScrollTo(containerRef.current, maxScroll, AUTO_SCROLL_DOWN_DURATION_MS, cancelRef);
        if (cancelRef.current) {
          throw new Error('cancelled');
        }

        await new Promise((resolve) => setTimeout(resolve, AUTO_SCROLL_PAUSE_AT_BOTTOM_MS));
        if (cancelRef.current) {
          throw new Error('cancelled');
        }

        if (containerRef.current && !cancelRef.current) {
          await smoothScrollTo(containerRef.current, 0, AUTO_SCROLL_UP_DURATION_MS, cancelRef);
        }
      } catch {
        // Отмена — штатный сценарий (размонтирование/смена данных), молча выходим.
      } finally {
        isAutoScrolling.current = false;
      }
    }, AUTO_SCROLL_START_DELAY_MS);

    return () => {
      clearTimeout(timeout);
      cancelRef.current = true;
      isAutoScrolling.current = false;
    };
  }, [needsScroll, dataSourceNames, containerRef]);
};
