import { PanelOptions } from 'types';
import { CSSProperties } from 'react';
import { GrafanaTheme2 } from '@grafana/data';
import { css } from '@emotion/css';

export const getTooltipContainerStyles = (
  theme: GrafanaTheme2,
  options: PanelOptions['tooltip'],
  coords: { x: number; y: number },
  hasTable?: boolean
): CSSProperties => ({
  position: 'fixed',
  left: coords.x,
  top: coords.y,
  backgroundColor: theme.colors.background.secondary,
  padding: '12px 6px 12px 12px',
  borderRadius: '5px',
  pointerEvents: 'auto',
  boxShadow: '0 3px 12px rgba(0, 0, 0, 0.3)',
  zIndex: 1000,
  maxWidth: hasTable ? 'auto' : `${options.maxWidth}px` || '500px',
  maxHeight: `${options.maxHeight}px` || '500px',
  display: 'flex',
  flexDirection: 'column',
  wordWrap: 'break-word',
  border: `1px solid ${theme.colors.border.weak}`,
  whiteSpace: 'nowrap',
  fontFamily: theme.typography.fontFamily,
  userSelect: 'text',
  overflow: 'hidden',
});

export const getContentClass = css`
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  padding-right: 6px;

  &::-webkit-scrollbar {
    width: 6px;
    height: 6px;
    padding-right: 6px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
    margin: 4px 0;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(128, 128, 128, 0.4);
    border-radius: 3px;
  }
  &::-webkit-scrollbar-thumb:hover {
    background: rgba(128, 128, 128, 0.6);
  }
  scrollbar-width: thin;
  scrollbar-color: rgba(128, 128, 128, 0.4) transparent;
`;

/* Время */
export const getTimeStyles = (theme: GrafanaTheme2): CSSProperties => ({
  color: theme.colors.text.primary,
  fontSize: '12px',
  marginBottom: '8px',
  paddingRight: '3px',
  gap: '8px',
});

export const getCloseButtonStyle = (theme: GrafanaTheme2): CSSProperties => ({
  cursor: 'pointer',
  fontSize: '10px',
});

/* Разделитель */
export const getDividerStyles = (theme: GrafanaTheme2): CSSProperties => ({
  borderBottom: `1px solid ${theme.colors.border.weak}`,
  margin: '0 -12px 8px -12px',
});

/* Метрики */
export const getMetricItemStyles = (): CSSProperties => ({
  marginBottom: '2px',
  lineHeight: '1.4',
});

/* Заголовок  метрики */
export const getTitleStyles = (theme: GrafanaTheme2): CSSProperties => ({
  color: theme.colors.text.secondary,
  marginBottom: '3px',
  fontSize: '12px',
});

/* Вид метрик */
export const getMetricContainerStyles = (options: PanelOptions['tooltip']): CSSProperties => ({
  display: options.valuePosition === 'right' ? 'flex' : 'block',
  justifyContent: options.valuePosition === 'right' ? 'space-between' : 'flex-start',
  alignItems: options.valuePosition === 'right' ? 'center' : 'flex-start',
});

/* значение лейбла метрики */
export const getLabelStyles = (theme: GrafanaTheme2, options: PanelOptions['tooltip']): CSSProperties => ({
  color: theme.colors.text.primary,
  marginRight: options.valuePosition === 'right' ? '8px' : '4px',
  fontSize: '13px',
});

/* значение метрики */
export const getValueStyles = (
  theme: GrafanaTheme2,
  options: PanelOptions['tooltip'],
  color?: string
): CSSProperties => ({
  color: color || theme.colors.text.primary,
  textAlign: options.valuePosition === 'right' ? 'right' : 'left',
  fontSize: '13px',
});

export const getTextLineStyles = (theme: GrafanaTheme2): CSSProperties => ({
  color: theme.colors.text.primary,
  fontSize: '13px',
  lineHeight: '1.4',
});

export const getTextBlockStyles = (): CSSProperties => ({
  marginBottom: '8px',
});

export const getDiagnosticStyles = (): CSSProperties => ({
  fontSize: '12px',
  lineHeight: '1.4',
});

/* Стили для таблицы */
export const getTableContainerStyles = (): CSSProperties => ({
  marginTop: '12px',
  maxWidth: '100%',
  overflowX: 'auto' as const,
});

export const getTableCellStyles = (theme: GrafanaTheme2, isHeader: boolean): CSSProperties => ({
  border: `1px solid ${theme.colors.border.weak}`,
  padding: '4px 6px',
  backgroundColor: isHeader ? theme.colors.background.secondary : 'transparent',
  fontWeight: isHeader ? 'bold' : 'normal',
  textAlign: 'left' as const,
  fontSize: '13px',
});

export const getTableHeaderRowStyles = (theme: GrafanaTheme2): CSSProperties => ({
  backgroundColor: theme.colors.background.secondary,
});
