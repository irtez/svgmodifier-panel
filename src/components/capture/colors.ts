import type { PaintV2 } from './modelsV2';
import tinycolor from 'tinycolor2';

export function capturePaint(css: string): PaintV2 {
  if (css.trim().toLowerCase() === 'none') {
    return { kind: 'none', css, rgba: null };
  }
  const parsed = tinycolor(css);
  if (!parsed.isValid()) {
    return { kind: 'other', css, rgba: null };
  }
  const { r, g, b, a } = parsed.toRgb();
  return { kind: 'solid', css, rgba: [r, g, b, a] };
}
