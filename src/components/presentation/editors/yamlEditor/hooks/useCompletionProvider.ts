import { useCallback, useEffect, useRef } from 'react';
import { configSchema } from '../domain/configSchema';
import { analyzeBlockContext } from '../domain/blockAnalysis';
import { EditorContext } from '../types';

type Disposable = { dispose: () => void };

export function useCompletionProvider() {
  const providerRef = useRef<Disposable | null>(null);

  const provideCompletionItems = useCallback(async (model: any, position: any) => {
    const lineContent = model.getLineContent(position.lineNumber);
    if (lineContent.trim() === '' && position.column <= 2) {
      return { suggestions: [] };
    }

    const ctx: EditorContext = {
      lineContent,
      position,
      model,
      currentIndent: (lineContent.match(/^\s*/)?.[0] || '').length,
      prevLine: position.lineNumber > 1 ? model.getLineContent(position.lineNumber - 1) : '',
    };

    // Считаем анализ блока ОДИН РАЗ на весь запрос автодополнения и передаём
    // готовый результат во все condition/items конфигурации ниже.
    const analysis = analyzeBlockContext(ctx);

    const word = model.getWordUntilPosition(position);
    const range = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endColumn: word.endColumn,
    };

    const suggestions: any[] = [];
    const seenKeys = new Set<string>();

    for (const entry of configSchema) {
      try {
        if (entry.condition && !(await entry.condition(ctx, analysis))) {
          continue;
        }

        const items = typeof entry.items === 'function' ? await entry.items(ctx, analysis) : entry.items;

        for (const item of items) {
          const key = `${item.label}-${item.insertText || item.label}`;
          if (seenKeys.has(key)) {
            continue;
          }
          seenKeys.add(key);
          suggestions.push(item);
        }
      } catch {
        continue;
      }
    }

    return { suggestions, range };
  }, []);

  /** Регистрирует провайдера в конкретном инстансе Monaco. Идемпотентно на remount. */
  const register = useCallback(
    (monaco: any) => {
      if (providerRef.current) {
        providerRef.current.dispose();
        providerRef.current = null;
      }

      providerRef.current = monaco.languages.registerCompletionItemProvider('yaml', {
        triggerCharacters: ['\n', ' ', ':'],
        provideCompletionItems: async (model: any, position: any) => {
          const result = await provideCompletionItems(model, position);
          return {
            suggestions: result.suggestions.map((item) => ({
              label: item.label,
              kind: monaco.languages.CompletionItemKind.Property,
              insertText: item.insertText || item.label,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range: result.range,
            })),
          };
        },
      });
    },
    [provideCompletionItems]
  );

  useEffect(() => {
    return () => {
      providerRef.current?.dispose();
      providerRef.current = null;
    };
  }, []);

  return { register };
}
