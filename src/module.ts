import { PanelPlugin, FieldConfigProperty } from '@grafana/data';
import { PanelOptions } from 'types';

import SvgPanel from 'components/application/mainPanel';
import YamlEditor from 'components/presentation/editors/yamlEditor/yamlEditor';
import { ExpressionsEditor } from 'components/presentation/editors/exprEditor/exprEditor';

export const plugin = new PanelPlugin<PanelOptions>(SvgPanel)
  .setPanelOptions((builder) => {
    return builder
      .addRadio({
        path: 'displayMode',
        name: 'Display mode',
        defaultValue: 'svg',
        settings: {
          options: [
            { label: 'SVG', value: 'svg' },
            { label: 'Table', value: 'table' },
            { label: 'Grid', value: 'grid' },
          ],
        },
      })
      .addBooleanSwitch({
        category: ['Grid settings'],
        path: 'grid.showOnlyFiring',
        name: 'show only firing',
        defaultValue: false,
        showIf: (config) => (config.displayMode ?? 'svg') === 'grid',
      })
      .addRadio({
        category: ['Grid settings'],
        path: 'grid.columnMode',
        name: 'Columns mode',
        defaultValue: 'auto',
        settings: {
          options: [
            { label: 'Auto', value: 'auto' },
            { label: 'Custom', value: 'custom' },
          ],
        },
        showIf: (config) => (config.displayMode ?? 'svg') === 'grid',
      })
      .addNumberInput({
        category: ['Grid settings'],
        path: 'grid.columns',
        name: 'Number of columns',
        defaultValue: 4,
        settings: { min: 1, max: 12 },
        showIf: (config) => (config.displayMode ?? 'svg') === 'grid' && config.grid.columnMode === 'custom',
      })
      .addRadio({
        category: ['Grid settings'],
        path: 'grid.layout',
        name: 'layout',
        defaultValue: 'columns',
        settings: {
          options: [
            { label: 'columns', value: 'columns' },
            { label: 'grid', value: 'grid' },
          ],
        },
        showIf: (config) => (config.displayMode ?? 'svg') === 'grid',
      })
      .addBooleanSwitch({
        category: ['Grid settings'],
        path: 'grid.stretch',
        name: 'stretch',
        defaultValue: false,
        showIf: (config) => (config.displayMode ?? 'svg') === 'grid' && config.grid.layout === 'grid',
      })
      .addTextInput({
        category: ['Grid settings'],
        path: 'grid.emptyPlaceholder',
        name: 'Empty placeholder',
        description: 'Enter your SVG',
        settings: {
          placeholder: 'No firing metrics',
        },
        showIf: (config) => (config.displayMode ?? 'svg') === 'grid',
      })
      .addTextInput({
        category: ['SVG settings'],
        path: 'jsonData.svgCode',
        name: 'SVG',
        description: 'Enter your SVG',
        settings: {
          rows: 3,
          useTextarea: true,
        },
        showIf: (config) => (config.displayMode ?? 'svg') === 'svg',
      })
      .addSelect({
        category: ['SVG settings'],
        path: 'jsonData.svgAspectRatio',
        name: 'Aspect Ratio',
        description: 'how the SVG should maintain its aspect ratio',
        defaultValue: 'disable',
        settings: {
          options: [
            { value: 'disable', label: 'disable' },
            { value: 'none', label: 'None' },
            { value: 'xMinYMin meet', label: 'Meet (preserve)' },
            { value: 'xMidYMid meet', label: 'Meet (center)' },
            { value: 'xMaxYMax meet', label: 'Meet (end)' },
            { value: 'xMinYMin slice', label: 'Slice' },
          ],
        },
        showIf: (config) => (config.displayMode ?? 'svg') === 'svg',
      })
      .addCustomEditor({
        category: ['Metrics mapping'],
        id: 'metricsMapping',
        path: 'jsonData.metricsMapping',
        name: 'Config',
        description: 'Create your config. use CTRL+SPACE for tips',
        editor: YamlEditor,
      })
      .addTextInput({
        category: ['Transformations'],
        path: 'jsonData.customRelativeTime',
        name: 'Custom relative time',
        description: 'time format for all fields (e.g., 2h30m, 1d6h)',
        defaultValue: '',
        settings: {
          placeholder: '30m',
        },
      })
      .addTextInput({
        category: ['Transformations'],
        path: 'jsonData.fieldsCustomRelativeTime',
        name: 'Field relative time',
        description: 'field time format (e.g., A: 2h30m, B: 1d6h)',
        defaultValue: '',
        settings: {
          rows: 2,
          useTextarea: true,
          placeholder: 'A,B,C,D: 30m; B: 15m;',
        },
      })
      .addCustomEditor({
        category: ['Transformations'],
        id: 'expressionsEditor',
        path: 'transformations.expressions',
        name: 'Expressions',
        description: 'Math operations on one or more queries',
        defaultValue: [],
        editor: ExpressionsEditor,
      })
      .addRadio({
        category: ['Tooltip'],
        path: 'tooltip.sort',
        name: 'Values sort order',
        defaultValue: 'none',
        settings: {
          options: [
            { value: 'none', label: 'None' },
            { value: 'ascending', label: 'Ascending' },
            { value: 'descending', label: 'Descending' },
          ],
        },
        showIf: (config) => (config.displayMode ?? 'svg') === 'svg',
      })
      .addNumberInput({
        category: ['Tooltip'],
        path: 'tooltip.maxWidth',
        name: 'Max width',
        defaultValue: 500,
        settings: {
          integer: true,
        },
        showIf: (config) => (config.displayMode ?? 'svg') === 'svg',
      })
      .addNumberInput({
        category: ['Tooltip'],
        path: 'tooltip.maxHeight',
        name: 'Max Height',
        defaultValue: 500,
        settings: {
          integer: true,
        },
        showIf: (config) => (config.displayMode ?? 'svg') === 'svg',
      })
      .addRadio({
        category: ['Tooltip'],
        path: 'tooltip.valuePosition',
        name: 'Value position',
        defaultValue: 'standard',
        settings: {
          options: [
            { value: 'standard', label: 'Standard' },
            { value: 'right', label: 'Right' },
          ],
        },
        showIf: (config) => (config.displayMode ?? 'svg') === 'svg',
      })
      .addBooleanSwitch({
        category: ['Tooltip'],
        path: 'tooltip.hideZeros',
        name: 'Hide zeros',
        defaultValue: false,
        showIf: (config) => (config.displayMode ?? 'svg') === 'svg',
      })
      .addBooleanSwitch({
        category: ['Notify tooltip'],
        path: 'notifyTooltip.show',
        name: 'enable',
        defaultValue: false,
      })
      .addNumberInput({
        category: ['Notify tooltip'],
        path: 'notifyTooltip.offsetX',
        name: 'offset X',
        defaultValue: 19,
        settings: {
          integer: true,
        },
        showIf: (config) => config.notifyTooltip.show,
      })
      .addNumberInput({
        category: ['Notify tooltip'],
        path: 'notifyTooltip.offsetY',
        name: 'offset Y',
        defaultValue: 146,
        settings: {
          integer: true,
        },
        showIf: (config) => config.notifyTooltip.show,
      })
      .addNumberInput({
        category: ['Notify tooltip'],
        path: 'notifyTooltip.threshold',
        name: 'Firing Threshold',
        defaultValue: 0,
        settings: {
          integer: true,
        },
        showIf: (config) => config.notifyTooltip.show,
      })
      .addTextInput({
        category: ['Notify tooltip'],
        path: 'notifyTooltip.excludeFilter',
        name: 'Exclude filter',
        defaultValue: '',
        settings: {
          rows: 2,
          useTextarea: true,
          placeholder: 'A,B,C,D',
        },
        showIf: (config) => config.notifyTooltip.show,
      })
      .addTextInput({
        category: ['Notify tooltip'],
        path: 'notifyTooltip.impactJson',
        name: 'Order JSON',
        defaultValue: '',
        settings: {
          useTextarea: true,
          rows: 8,
          placeholder: '[{"trace_id":"1","data":["..."]}]',
        },
        showIf: (config) => config.notifyTooltip.show,
      });
  })
  .useFieldConfig({
    disableStandardOptions: Object.values(FieldConfigProperty),
  });
