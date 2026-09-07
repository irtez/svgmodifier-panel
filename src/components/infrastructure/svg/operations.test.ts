import { ConfigRules, MetricData } from 'components/domain/models';
import { updateSvg } from './updater';
import { createSvgUpdateOperation } from './operations';

class SyntheticSVGTextElement extends SVGElement {}

beforeAll(() => {
  Object.defineProperty(globalThis, 'SVGTextElement', {
    configurable: true,
    value: SyntheticSVGTextElement,
  });
});

function svgElement(tag: string): SVGElement {
  return document.createElementNS('http://www.w3.org/2000/svg', tag);
}

function metric(overrides: Partial<MetricData> = {}): MetricData {
  return {
    counter: 1,
    label: 'metric',
    color: '#ff0000',
    lvl: 1,
    metricValue: 1,
    filling: 'fill, 20',
    ...overrides,
  };
}

describe('createSvgUpdateOperation transitions', () => {
  it('U09 updates a created SVG link and removes its wrapper when link settings disappear', () => {
    const host = svgElement('svg');
    const rect = svgElement('rect');
    host.appendChild(rect);

    createSvgUpdateOperation(rect, { link: 'https://example.test/first' }, metric())();
    createSvgUpdateOperation(rect, { link: 'https://example.test/second' }, metric())();

    expect(rect.parentElement?.localName).toBe('a');
    expect(rect.parentElement?.getAttribute('href')).toBe('https://example.test/second');

    createSvgUpdateOperation(rect, {} as ConfigRules['attributes'], metric())();

    expect(rect.parentNode).toBe(host);
    expect(rect.hasAttribute('data-has-link')).toBe(false);
  });

  it('U09 restores an original SVG link after a dynamic link setting disappears', () => {
    const host = svgElement('svg');
    const originalLink = svgElement('a');
    originalLink.setAttribute('href', 'https://example.test/original');
    const rect = svgElement('rect');
    originalLink.appendChild(rect);
    host.appendChild(originalLink);

    createSvgUpdateOperation(rect, { link: 'https://example.test/dynamic' }, metric())();
    expect(originalLink.getAttribute('href')).toBe('https://example.test/dynamic');

    createSvgUpdateOperation(rect, {} as ConfigRules['attributes'], metric())();
    expect(originalLink.getAttribute('href')).toBe('https://example.test/original');
  });

  it('U09 safely restores prior updates when data or attributes are missing and skips a missing DOM target', () => {
    const host = svgElement('svg');
    const rect = svgElement('rect');
    rect.setAttribute('fill', '#102030');
    host.appendChild(rect);

    createSvgUpdateOperation(rect, {} as ConfigRules['attributes'], metric())();
    createSvgUpdateOperation(
      rect,
      undefined as unknown as ConfigRules['attributes'],
      undefined as unknown as MetricData
    )();

    const otherRect = svgElement('rect');
    host.appendChild(otherRect);
    const validOperation = createSvgUpdateOperation(otherRect, {} as ConfigRules['attributes'], metric());
    const missingTargetOperation = createSvgUpdateOperation(
      undefined as unknown as SVGElement,
      {} as ConfigRules['attributes'],
      metric()
    );

    expect(() => updateSvg([missingTargetOperation, validOperation], host)).not.toThrow();
    expect(rect.getAttribute('fill')).toBe('#102030');
    expect(rect.hasAttribute('fill-opacity')).toBe(false);
    expect(otherRect.getAttribute('fill')).toBe('#ff0000');
  });

  it('U08 keeps SVG text on the current element color after labelColor is removed', () => {
    const text = svgElement('text');
    text.setAttribute('fill', '#0000ff');
    text.textContent = 'Static';
    Object.setPrototypeOf(text, SyntheticSVGTextElement.prototype);

    createSvgUpdateOperation(
      text,
      { label: 'replace', labelColor: 'metric' },
      metric({ metricValue: 42, filling: 'fill' })
    )();
    expect(text.getAttribute('fill')).toBe('#ff0000');
    expect(text.textContent).toBe('42');

    createSvgUpdateOperation(
      text,
      { label: 'replace' },
      metric({ color: '#00ff00', metricValue: 7, filling: 'fill' })
    )();

    expect(text.getAttribute('fill')).toBe('#00ff00');
    expect(text.textContent).toBe('7');
  });
});
