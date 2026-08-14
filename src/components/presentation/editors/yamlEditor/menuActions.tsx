import React from 'react';
import { Button } from '@grafana/ui';
import { css } from '@emotion/css';

interface OptionWithActionsProps {
  label: string;
  index: number;
  onRename: (index: number) => void;
  onDelete: (index: number) => void;
  isAddButton?: boolean;
  showActions?: boolean;
}

const styles = {
  container: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: 20px;
    padding: 2px 2px;
  `,
  addButton: css`
    display: flex;
    align-items: center;
    width: 100%;
    color: #00a8ff;
    font-weight: 500;
    padding: 4px 8px;
  `,
  label: css`
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  actions: css`
    display: flex;
    gap: 4px;
    flex-shrink: 0;
    margin-left: 8px;
  `,
};

export const OptionWithActions = React.memo<OptionWithActionsProps>(
  ({ label, index, onRename, onDelete, isAddButton, showActions = false }) => {
    if (isAddButton) {
      return <div className={styles.addButton}>+ {label}</div>;
    }

    const trimmedLabel = label.trim();

    return (
      <div className={styles.container}>
        <span className={styles.label}>{trimmedLabel}</span>
        {showActions && (
          <div className={styles.actions}>
            <Button
              size="sm"
              variant="secondary"
              icon="pen"
              onClick={(e) => {
                e.stopPropagation();
                onRename(index);
              }}
              title="Rename"
            />
            <Button
              size="sm"
              variant="destructive"
              icon="trash-alt"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(index);
              }}
              title="Delete"
            />
          </div>
        )}
      </div>
    );
  }
);

OptionWithActions.displayName = 'OptionWithActions';
