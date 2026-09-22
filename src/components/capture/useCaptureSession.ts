import { useMemo, useLayoutEffect } from 'react';
import { connectCapture, type CaptureConnection } from './session';
import type { CapturePublication } from './runtime';
import packageInfo from '../../../package.json';

export function useCaptureSession(panelId: number) {
  const connection = useMemo(() => ({ panelId, current: null as CaptureConnection | null }), [panelId]);
  useLayoutEffect(() => {
    const current = connectCapture(panelId, packageInfo.version);
    connection.current = current;
    return () => {
      current?.close();
      connection.current = null;
    };
  }, [panelId, connection]);
  return connection;
}
export function useCaptureCommit(
  publication: CapturePublication | undefined,
  root: React.RefObject<SVGElement | null>,
  width: number,
  height: number
) {
  useLayoutEffect(() => {
    publication?.commit(root.current, width + ':' + height);
  }, [publication, root, width, height]);
}
