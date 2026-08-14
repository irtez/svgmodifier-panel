import React, { Suspense } from 'react';
import { StandardEditorProps } from '@grafana/data';
import { Page } from './types';

const LazyYamlEditor = React.lazy(() => import('./YamlEditor'));

const YamlEditorLoader: React.FC<StandardEditorProps<Page[]>> = (props) => (
  <Suspense fallback={<div style={{ padding: 8, fontSize: 12 }}>Загрузка редактора...</div>}>
    <LazyYamlEditor {...props} />
  </Suspense>
);

export default YamlEditorLoader;
