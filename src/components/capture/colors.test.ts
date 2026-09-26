import { capturePaint } from './colors';

describe('capture paint facts', () => {
  it.each([
    ['rgba(50,172,45,0.97)', [50, 172, 45, 0.97]],
    ['#00ff00', [0, 255, 0, 1]],
    ['#f003', [255, 0, 0, 0.2]],
    ['rgb(255, 0, 30)', [255, 0, 30, 1]],
    ['green', [0, 128, 0, 1]],
    ['yellow', [255, 255, 0, 1]],
    ['transparent', [0, 0, 0, 0]],
  ])('preserves exact channels and alpha for %s', (css, rgba) => {
    expect(capturePaint(css as string)).toEqual({ kind: 'solid', css, rgba });
  });

  it('distinguishes no paint from a transparent solid color', () => {
    expect(capturePaint('none')).toEqual({ kind: 'none', css: 'none', rgba: null });
  });

  it.each(['url(#gradient)', 'not-a-color', 'currentColor', 'var(--metric-color)', ''])(
    'does not invent a black color for %s',
    (css) => expect(capturePaint(css)).toEqual({ kind: 'other', css, rgba: null })
  );
});
