export const SUGGESTION_TEMPLATES = {
  DEFAULT_TEMPLATE: 'changes:\n  ',

  CHANGES: "- id: '${1}'\n  attributes:\n    ",

  // attributes
  LINK: "link: ''",
  TOOLTIP: 'tooltip:\n  show: true\n  hideNoDataWarnings: false',
  LABEL: "label: 'replace'",
  LABEL_COLOR: "labelColor: 'metric'",
  AUTO_CONFIG: 'autoConfig: true',
  LABEL_MAPPING: "valueMapping:\n  - { condition: '${1|>=,>,<,=,!=,<=|}', value: ${2}, label: '${3}' }",
  ADD_MAPPING: "- { condition: '${1|>=,>,<,=,!=,<=|}', value: ${2}, label: '${3}' }",
  METRICS: 'metrics:\n  ',

  // metrics
  QUERIES: "queries:\n  - { ${1|refid,legend|}: '${2}' }",
  ADD_QUERY: "- { ${1|refid,legend|}: '${2}' }",
  DECIMAL: 'decimal: 0',
  BASE_COLOR: "baseColor: 'rgba(50, 172,45, 0.97)'",
  FILLING: "filling: '${1|fill,stroke,fs,fill\\, 20,none|}'",
  THRESHOLDS: "thresholds:\n  - { color: 'orange', value: 10 }\n  - { color: 'red', value: 20 }",
  ADD_THRESHOLD: "- { color: '', value:  }",

  // refs params
  FILTER: "filter: '${1| ,$date,$dateN|}'",
  LABEL_METRIC: "label: '${1}'",
  SUM: "sum: '${1}'",
  UNIT: "unit: '${1|seconds,milliseconds,bytes,percent,percent(0-1)|}'",
  CALCULATION: "calculation: '${1|last,total,max,min,count,delta|}'",

  // Thresholds
  LVL: 'lvl: ${1}',
  OPERATOR: "operator: '${1|=,>,<,>=,!=,<=|}'",
  CONDITION: "condition: '${1|hour >= 9 && hour < 18 && day !== 0 && day !== 6|}'",

  // defs
  DEF_CONFIG:
    `- id: ''\n  attributes:\n    tooltip:\n      show: true\n      hideNoDataWarnings: false\n    metrics:\n      queries:\n` +
    `        - { refid: '' }\n      baseColor: 'rgba(50, 172,45, 0.97)'\n      thresholds:\n        - { color: 'orange', value: 10 }`,
  THRESHOLDS_ROOT: `thresholds:\n  name: &name\n  - { color: 'orange', value: 10 }\n  - { color: 'red', value: 20 }`,
} as const;
