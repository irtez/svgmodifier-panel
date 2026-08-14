import { SUGGESTION_TEMPLATES } from './suggestionTemplates';

export const SUGGESTION_GROUPS = {
  ROOT: [{ label: 'thresholds', insertText: SUGGESTION_TEMPLATES.THRESHOLDS_ROOT }],

  CHANGES: [{ label: 'id', insertText: SUGGESTION_TEMPLATES.CHANGES }],

  DEFS: [{ label: 'defConfig', insertText: SUGGESTION_TEMPLATES.DEF_CONFIG }],

  ATTRIBUTES: [
    { label: 'link', insertText: SUGGESTION_TEMPLATES.LINK },
    { label: 'tooltip', insertText: SUGGESTION_TEMPLATES.TOOLTIP },
    { label: 'label', insertText: SUGGESTION_TEMPLATES.LABEL },
    { label: 'labelColor', insertText: SUGGESTION_TEMPLATES.LABEL_COLOR },
    { label: 'autoConfig', insertText: SUGGESTION_TEMPLATES.AUTO_CONFIG },
    { label: 'valueMapping', insertText: SUGGESTION_TEMPLATES.LABEL_MAPPING },
    { label: 'add mapping', insertText: SUGGESTION_TEMPLATES.ADD_MAPPING },
    { label: 'metrics', insertText: SUGGESTION_TEMPLATES.METRICS },
  ],

  METRICS: [
    { label: 'queries', insertText: SUGGESTION_TEMPLATES.QUERIES },
    { label: 'add query', insertText: SUGGESTION_TEMPLATES.ADD_QUERY },
    { label: 'decimal', insertText: SUGGESTION_TEMPLATES.DECIMAL },
    { label: 'baseColor', insertText: SUGGESTION_TEMPLATES.BASE_COLOR },
    { label: 'filling', insertText: SUGGESTION_TEMPLATES.FILLING },
    { label: 'thresholds', insertText: SUGGESTION_TEMPLATES.THRESHOLDS },
    { label: 'add threshold', insertText: SUGGESTION_TEMPLATES.ADD_THRESHOLD },
  ],

  QUERY: [
    { label: 'filter', insertText: SUGGESTION_TEMPLATES.FILTER },
    { label: 'label', insertText: SUGGESTION_TEMPLATES.LABEL_METRIC },
    { label: 'sum', insertText: SUGGESTION_TEMPLATES.SUM },
    { label: 'unit', insertText: SUGGESTION_TEMPLATES.UNIT },
    { label: 'calculation', insertText: SUGGESTION_TEMPLATES.CALCULATION },
  ],

  THRESHOLD: [
    { label: 'lvl', insertText: SUGGESTION_TEMPLATES.LVL },
    { label: 'operator', insertText: SUGGESTION_TEMPLATES.OPERATOR },
    { label: 'condition', insertText: SUGGESTION_TEMPLATES.CONDITION },
  ],
} as const;
