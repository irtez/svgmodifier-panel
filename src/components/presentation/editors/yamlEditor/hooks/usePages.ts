import { useCallback, useEffect, useMemo, useState } from 'react';
import { Page } from '../types';

function normalizePages(value: unknown): Page[] {
  if (Array.isArray(value) && value.every((v) => v && typeof v === 'object' && 'page' in v && 'code' in v)) {
    return value as Page[];
  }
  if (typeof value === 'string') {
    return [{ page: 'Page 1', code: value }];
  }
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
    return (value as string[]).map((code, idx) => ({ page: `Page ${idx + 1}`, code }));
  }
  return [{ page: 'Page 1', code: 'changes:\n  ' }];
}

export function usePages(value: unknown, onChange: (pages: Page[]) => void) {
  const normalizedPages = useMemo(() => normalizePages(value), [value]);

  const [pages, setPages] = useState<Page[]>(normalizedPages);
  const [activePageIndex, setActivePageIndex] = useState(0);

  useEffect(() => {
    setPages(normalizedPages);
    if (activePageIndex >= normalizedPages.length) {
      setActivePageIndex(Math.max(0, normalizedPages.length - 1));
    }
  }, [normalizedPages, activePageIndex]);

  const savePages = useCallback((newPages: Page[]) => onChange(newPages), [onChange]);

  const addPage = useCallback(() => {
    const newPage: Page = { page: `Page ${pages.length + 1}`, code: 'changes:\n  ' };
    const newPages = [...pages, newPage];
    setPages(newPages);
    setActivePageIndex(newPages.length - 1);
    savePages(newPages);
  }, [pages, savePages]);

  const deletePage = useCallback(
    (index: number) => {
      if (pages.length <= 1) {
        return;
      }
      const newPages = pages.filter((_, i) => i !== index);
      setPages(newPages);
      if (activePageIndex === index) {
        setActivePageIndex(Math.min(index, newPages.length - 1));
      } else if (activePageIndex > index) {
        setActivePageIndex(activePageIndex - 1);
      }
      savePages(newPages);
    },
    [pages, activePageIndex, savePages]
  );

  const renamePage = useCallback(
    (index: number, newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed || trimmed === pages[index]?.page) {
        return;
      }
      const newPages = [...pages];
      newPages[index] = { ...newPages[index], page: trimmed };
      setPages(newPages);
      savePages(newPages);
    },
    [pages, savePages]
  );

  const updatePageCode = useCallback(
    (index: number, newCode: string) => {
      const newPages = [...pages];
      newPages[index] = { ...newPages[index], code: newCode };
      setPages(newPages);
      savePages(newPages);
    },
    [pages, savePages]
  );

  return {
    pages,
    activePageIndex,
    setActivePageIndex,
    addPage,
    deletePage,
    renamePage,
    updatePageCode,
  };
}
