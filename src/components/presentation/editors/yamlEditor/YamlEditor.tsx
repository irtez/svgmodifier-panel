import React, { useCallback, useState } from 'react';
import { StandardEditorProps } from '@grafana/data';
import { CodeEditor, useStyles2 } from '@grafana/ui';
import { css } from '@emotion/css';
import { MONACO_OPTIONS } from './monacoOptions';
import { Page } from './types';
import { usePages } from './hooks/usePages';
import { useCompletionProvider } from './hooks/useCompletionProvider';
import { PageSelector } from './components/PageSelector';
import { RenamePageModal } from './components/RenamePageModal';
import { DeletePageModal } from './components/DeletePageModal';

const YamlEditor: React.FC<StandardEditorProps<Page[]>> = ({ value, onChange }) => {
  const { pages, activePageIndex, setActivePageIndex, addPage, deletePage, renamePage, updatePageCode } = usePages(
    value,
    onChange
  );
  const { register } = useCompletionProvider();

  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [renamePageIndex, setRenamePageIndex] = useState<number | null>(null);
  const [deletePageIndex, setDeletePageIndex] = useState<number | null>(null);

  const styles = useStyles2(() => ({
    editorContainer: css`
      min-height: 500px;
    `,
  }));

  const openRenameModal = useCallback((index: number) => {
    setRenamePageIndex(index);
    setRenameModalOpen(true);
  }, []);

  const confirmDeletePage = useCallback((index: number) => {
    setDeletePageIndex(index);
    setDeleteModalOpen(true);
  }, []);

  const handleRenameConfirm = useCallback(
    (newName: string) => {
      if (renamePageIndex !== null) {
        renamePage(renamePageIndex, newName);
      }
      setRenameModalOpen(false);
      setRenamePageIndex(null);
    },
    [renamePageIndex, renamePage]
  );

  const handleDeleteConfirm = useCallback(() => {
    if (deletePageIndex !== null) {
      deletePage(deletePageIndex);
    }
    setDeleteModalOpen(false);
    setDeletePageIndex(null);
  }, [deletePageIndex, deletePage]);

  const handleEditorDidMount = useCallback(
    (_editor: any, monaco: any) => {
      register(monaco);
    },
    [register]
  );

  const currentPage = pages[activePageIndex];
  if (!currentPage) {
    return null;
  }

  return (
    <div>
      <PageSelector
        pages={pages}
        activePageIndex={activePageIndex}
        onSelect={setActivePageIndex}
        onAddPage={addPage}
        onRename={openRenameModal}
        onDelete={confirmDeletePage}
      />

      <div className={styles.editorContainer}>
        <CodeEditor
          key={currentPage.page}
          value={currentPage.code}
          language="yaml"
          height="500px"
          width="100%"
          showMiniMap={false}
          showLineNumbers={true}
          onBlur={(val) => updatePageCode(activePageIndex, val)}
          onSave={(val) => updatePageCode(activePageIndex, val)}
          onEditorDidMount={handleEditorDidMount}
          monacoOptions={MONACO_OPTIONS}
        />
      </div>

      <RenamePageModal
        isOpen={renameModalOpen}
        currentName={pages[renamePageIndex ?? activePageIndex]?.page ?? ''}
        onDismiss={() => setRenameModalOpen(false)}
        onConfirm={handleRenameConfirm}
      />

      <DeletePageModal
        isOpen={deleteModalOpen}
        pageName={pages[deletePageIndex ?? -1]?.page}
        onDismiss={() => setDeleteModalOpen(false)}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
};

export default YamlEditor;
