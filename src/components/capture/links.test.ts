import { captureLink } from './links';

const context = {
  documentUrl: 'http://callback.test/grafana/d-solo/current/overview?render=1',
  baseUrl: 'http://callback.test/grafana/',
  appUrl: 'https://public.test/grafana/',
};

describe('capture navigation destinations', () => {
  it('resolves relative links against the real base and retains duplicate parameters', () => {
    expect(captureLink('d/target/details?var-node=a&var-node=b&panelId=panel-7&from=now-3h', context)).toEqual({
      dashboardUid: 'target',
      panelId: 7,
      path: '/grafana/d/target/details',
      query: [
        ['var-node', 'a'],
        ['var-node', 'b'],
        ['panelId', 'panel-7'],
        ['from', 'now-3h'],
      ],
    });
  });

  it('accepts a configured public origin without rewriting its URL', () => {
    expect(captureLink('https://public.test/grafana/d/target/details', context)?.dashboardUid).toBe('target');
  });

  it('does not silently fix a root-relative link missing the Grafana subpath', () => {
    expect(captureLink('/d/target/details', context)).toBeNull();
    expect(captureLink('/grafana/d/target/details', context)?.dashboardUid).toBe('target');
  });

  it.each([
    'https://other.test/grafana/d/target/details',
    '//other.test/grafana/d/target/details',
    'javascript:alert(1)',
    'data:text/html,example',
    'http://user:secret@callback.test/grafana/d/target/details',
    '/grafana/d/name%2Fother/details',
    '/grafana/d/%ZZ/details',
    '/grafana/d//details',
    '',
    '#anchor',
  ])('leaves an unproven destination opaque: %s', (url) => {
    expect(captureLink(url, context)).toBeNull();
  });

  it('does not pick one of two different panel parameters', () => {
    const result = captureLink('/grafana/d/target/details?panelId=7&panelId=8', context);
    expect(result?.panelId).toBeNull();
    expect(result?.query).toEqual([
      ['panelId', '7'],
      ['panelId', '8'],
    ]);
  });

  it('retains unknown time parameters without computing new time windows', () => {
    expect(captureLink('/grafana/d-solo/target/details?from=now-1d%2Fd&to=now%2Fd', context)?.query).toEqual([
      ['from', 'now-1d/d'],
      ['to', 'now/d'],
    ]);
  });
});
