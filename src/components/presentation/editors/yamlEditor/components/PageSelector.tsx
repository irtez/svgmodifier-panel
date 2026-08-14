import React, { useMemo } from 'react';
import { Select, useStyles2 } from '@grafana/ui';
import { css } from '@emotion/css';
import { OptionWithActions } from '../menuActions';
import { Page } from '../types';

interface PageSelectorProps {
  pages: Page[];
  activePageIndex: number;
  onSelect: (index: number) => void;
  onAddPage: () => void;
  onRename: (index: number) => void;
  onDelete: (index: number) => void;
}

const useSelectorStyles = () =>
  useStyles2(() => ({
    toolbar: css`
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
      align-items: center;
    `,
    pageSelector: css`
      width: 300px;
      .grafana-select-value-container {
        height: 32px !important;
        min-height: 32px !important;
        max-height: 32px !important;
        overflow: hidden;
      }
      .grafana-select-single-value {
        line-height: 1.2 !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }
    `,
  }));

export const PageSelector: React.FC<PageSelectorProps> = ({
  pages,
  activePageIndex,
  onSelect,
  onAddPage,
  onRename,
  onDelete,
}) => {
  const styles = useSelectorStyles();

  const pageOptions = useMemo(() => pages.map((p, idx) => ({ label: p.page, value: idx })), [pages]);
  const optionsWithAdd = useMemo(
    () => [...pageOptions, { label: 'Add new page...', value: pages.length, isAddButton: true }],
    [pageOptions, pages.length]
  );
  const selectValue = useMemo(
    () => pageOptions.find((opt) => opt.value === activePageIndex),
    [pageOptions, activePageIndex]
  );

  const formatOptionLabel = (opt: any, { context }: any) => {
    const isInMenu = context === 'menu';
    return (
      <OptionWithActions
        label={opt.label.trim()}
        index={opt.value}
        onRename={onRename}
        onDelete={onDelete}
        isAddButton={opt.isAddButton}
        showActions={!opt.isAddButton && isInMenu}
      />
    );
  };

  const handleChange = (opt: any) => {
    if (opt?.isAddButton) {
      onAddPage();
    } else if (opt?.value !== undefined && opt.value < pages.length) {
      onSelect(opt.value);
    }
  };

  return (
    <div className={styles.toolbar}>
      <Select
        className={styles.pageSelector}
        options={optionsWithAdd}
        value={selectValue}
        onChange={handleChange}
        formatOptionLabel={formatOptionLabel}
        placeholder="Select page"
      />
    </div>
  );
};
