import type { CapturedLinkDestination } from './modelsV2';

export interface LinkContext {
  documentUrl: string;
  baseUrl: string;
  appUrl: string;
}

export function captureLink(url: string, context: LinkContext): CapturedLinkDestination | null {
  if (!url.trim() || url.trim().startsWith('#')) {
    return null;
  }
  try {
    const document = new URL(context.documentUrl);
    const app = new URL(context.appUrl, document);
    const target = new URL(url, context.baseUrl);
    if (
      !['http:', 'https:'].includes(target.protocol) ||
      target.username ||
      target.password ||
      ![document.origin, app.origin].includes(target.origin)
    ) {
      return null;
    }
    const prefix = app.pathname.replace(/\/$/, '') + '/';
    if (!target.pathname.startsWith(prefix)) {
      return null;
    }
    const parts = target.pathname.slice(prefix.length).split('/');
    if (parts.length !== 3 || !['d', 'd-solo'].includes(parts[0]) || !parts[1] || !parts[2]) {
      return null;
    }
    const dashboardUid = decodeURIComponent(parts[1]);
    if (!dashboardUid || /[\/\\\u0000-\u001f]/.test(dashboardUid) || ['.', '..'].includes(dashboardUid)) {
      return null;
    }
    const panelValues = target.searchParams.getAll('panelId');
    const rawId = panelValues.length === 1 ? panelValues[0].replace(/^panel-/, '') : '';
    const panelId = /^(0|[1-9][0-9]*)$/.test(rawId) && Number.isSafeInteger(Number(rawId)) ? Number(rawId) : null;
    return { dashboardUid, panelId, path: target.pathname, query: Array.from(target.searchParams.entries()) };
  } catch {
    return null;
  }
}
