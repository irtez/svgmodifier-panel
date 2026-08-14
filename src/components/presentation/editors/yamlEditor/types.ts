export type SuggestionItem = {
  label: string;
  insertText: string;
  documentation?: string;
};

export type EditorContext = {
  currentIndent: number;
  lineContent: string;
  prevLine: string;
  position: any;
  model: any;
  lines?: string[];
};

export interface Page {
  page: string;
  code: string;
}
