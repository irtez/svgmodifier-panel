import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { dateTime } from '@grafana/data';
import { TooltipContent } from 'components/domain/models';
import { Tooltip } from './tooltip';
import { processTooltipContent } from './utils';

const options = {
  sort: 'none' as const,
  hideZeros: true,
  maxWidth: 500,
  maxHeight: 500,
  valuePosition: 'standard' as const,
};
const timeRange = { from: dateTime(0), to: dateTime(1000), raw: { from: 'now-1h', to: 'now' } };
const missing: TooltipContent = {
  id: 'cell-a',
  noData: true,
  diagnostics: [
    { code: 'MISSING_INPUT', severity: 'error', message: 'Нет данных по запросу A', source: { refId: 'A' } },
  ],
};

it('[N20] предупреждения и общий no-data компактнее метрик и авторского текста', () => {
  const host = document.createElement('div');
  host.innerHTML = '<svg><g id="cell-a"><rect /></g></svg>';
  document.body.append(host);
  const content: TooltipContent = {
    ...missing,
    textAbove: 'Авторская подпись',
    queryData: [{ label: 'Synthetic metric', metric: '95', color: 'red' }],
    diagnostics: [
      ...missing.diagnostics!,
      { code: 'INVALID_CONDITION', severity: 'error', message: 'Synthetic condition error' },
    ],
  };
  render(
    <Tooltip containerRef={{ current: host }} tooltipContent={[content]} options={options} timeRange={timeRange} />
  );
  fireEvent.mouseOver(host.querySelector('rect')!);
  const assertSizes = () => {
    expect(screen.getByText('Нет данных для определения состояния')).toHaveStyle({ fontSize: '12px' });
    expect(screen.getByText('Нет данных по запросу A').closest('ul')).toHaveStyle({ fontSize: '12px' });
    expect(screen.getByText('Synthetic condition error').closest('ul')).toHaveStyle({ fontSize: '12px' });
    expect(screen.getByText('Авторская подпись')).toHaveStyle({ fontSize: '13px' });
    expect(screen.getByText('95')).toHaveStyle({ fontSize: '13px' });
  };
  assertSizes();
  fireEvent.contextMenu(host.querySelector('rect')!);
  assertSizes();
  host.remove();
});

it('[U04] hideZeros не скрывает сообщения и не изменяет исходный результат', () => {
  const input: TooltipContent = { ...missing, queryData: [{ label: 'zero', metric: '0', color: 'green' }] };
  const processed = processTooltipContent(input, options)!;
  expect(processed.queryData).toEqual([]);
  expect(processed.diagnostics).toHaveLength(1);
  expect(input.queryData).toHaveLength(1);
});

it('[U01,U05] hover и закреплённая подсказка обновляются при потере данных', () => {
  const host = document.createElement('div');
  host.innerHTML = '<svg><g id="cell-a"><rect /></g></svg>';
  document.body.append(host);
  const ref = { current: host };
  const initial: TooltipContent = {
    id: 'cell-a',
    queryData: [{ label: 'Synthetic metric', metric: '95', color: 'red' }],
  };
  const view = render(
    <Tooltip containerRef={ref} tooltipContent={[initial]} options={options} timeRange={timeRange} />
  );
  const shape = host.querySelector('rect')!;
  fireEvent.mouseOver(shape);
  expect(screen.getByText('95')).toBeInTheDocument();
  view.rerender(<Tooltip containerRef={ref} tooltipContent={[missing]} options={options} timeRange={timeRange} />);
  expect(screen.queryByText('95')).not.toBeInTheDocument();
  expect(screen.getByText('Нет данных по запросу A')).toBeInTheDocument();
  fireEvent.contextMenu(shape);
  view.rerender(<Tooltip containerRef={ref} tooltipContent={[initial]} options={options} timeRange={timeRange} />);
  expect(screen.getByText('95')).toBeInTheDocument();
  expect(screen.queryByText('Нет данных по запросу A')).not.toBeInTheDocument();
  view.rerender(<Tooltip containerRef={ref} tooltipContent={[]} options={options} timeRange={timeRange} />);
  expect(screen.queryByText('95')).not.toBeInTheDocument();
  host.remove();
});
