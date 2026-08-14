export const MONACO_OPTIONS = {
  lineNumbers: 'on' as const,
  lineNumbersMinChars: 3,
  tabSize: 2,
  insertSpaces: true,
  minimap: { enabled: false },
  wordWrap: 'off' as const,
  scrollBeyondLastLine: false,
  automaticLayout: true,
  suggest: {
    enabled: true,
    showWords: false,
    showSnippets: false,
  },
  quickSuggestions: false,
  suggestOnTriggerCharacters: false,
  autoClosingBrackets: 'always' as const,
  autoClosingQuotes: 'always' as const,
};
