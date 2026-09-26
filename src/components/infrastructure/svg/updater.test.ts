import { applySvgUpdateTargets, collectSvgUpdateTargets, initSVG } from './updater';

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

describe('SVG update restoration', () => {
  it('U06 restores absent paint attributes and inline paint properties without discarding unrelated style', () => {
    const rect = svgElement('rect');
    rect.setAttribute('style', 'fill: #112233; stroke: #445566; fill-opacity: 0.5; transform: rotate(10deg)');
    const targets = collectSvgUpdateTargets(rect);

    applySvgUpdateTargets(targets, [false, undefined], [false, undefined], ['#ff0000', '#00ff00', '0.2']);

    expect(rect.getAttribute('fill')).toBe('#ff0000');
    expect(rect.getAttribute('stroke')).toBe('#00ff00');
    expect(rect.getAttribute('fill-opacity')).toBe('0.2');
    expect(rect.style.getPropertyValue('transform')).toBe('rotate(10deg)');
    expect(rect.style.getPropertyValue('fill')).toBe('');

    applySvgUpdateTargets(targets, [false, undefined], [false, undefined], [null, null, null]);

    expect(rect.hasAttribute('fill')).toBe(false);
    expect(rect.hasAttribute('stroke')).toBe(false);
    expect(rect.hasAttribute('fill-opacity')).toBe(false);
    expect(rect.style.getPropertyValue('fill')).toBe('#112233');
    expect(rect.style.getPropertyValue('stroke')).toBe('#445566');
    expect(rect.style.getPropertyValue('fill-opacity')).toBe('0.5');
    expect(rect.style.getPropertyValue('transform')).toBe('rotate(10deg)');
  });

  it('U07 restores old dynamic fill and opacity before a stroke-only update', () => {
    const rect = svgElement('rect');
    rect.setAttribute('fill', '#102030');
    rect.setAttribute('stroke', '#405060');
    rect.setAttribute('fill-opacity', '0.7');
    const targets = collectSvgUpdateTargets(rect);

    applySvgUpdateTargets(targets, [false, undefined], [false, undefined], ['#ff0000', null, '0.2']);
    applySvgUpdateTargets(targets, [false, undefined], [false, undefined], [null, '#00ff00', null]);

    expect(rect.getAttribute('fill')).toBe('#102030');
    expect(rect.getAttribute('fill-opacity')).toBe('0.7');
    expect(rect.getAttribute('stroke')).toBe('#00ff00');
  });

  it('U08 restores original text and color when label settings disappear', () => {
    const text = svgElement('text');
    text.textContent = 'Original label';
    text.setAttribute('fill', '#102030');
    Object.setPrototypeOf(text, SyntheticSVGTextElement.prototype);
    const targets = collectSvgUpdateTargets(text);

    applySvgUpdateTargets(targets, [true, 'Live value'], [true, '#ff0000']);
    applySvgUpdateTargets(targets, [false, undefined], [false, undefined], undefined);

    expect(text.textContent).toBe('Original label');
    expect(text.getAttribute('fill')).toBe('#102030');
  });

  it('U08 restores an important HTML label color directly after labelColor removal', () => {
    const foreignObject = svgElement('foreignObject');
    const label = document.createElement('div');
    label.textContent = 'Original label';
    label.setAttribute('style', 'color: blue !important; font-size: 18px');
    foreignObject.appendChild(label);
    const targets = collectSvgUpdateTargets(foreignObject);

    applySvgUpdateTargets(targets, [false, undefined], [true, 'red'], undefined);
    expect(label.style.getPropertyValue('color')).toBe('red');

    applySvgUpdateTargets(targets, [false, undefined], [false, undefined], undefined);

    expect(label.style.getPropertyValue('color')).toBe('blue');
    expect(label.style.getPropertyPriority('color')).toBe('important');
    expect(label.style.getPropertyValue('font-size')).toBe('18px');
  });
});

describe('initSVG input validation', () => {
  it('C29 returns null for malformed SVG and a non-SVG document root', () => {
    expect(initSVG('<svg><rect></svg>')).toBeNull();
    expect(initSVG('<html><body>not an SVG</body></html>')).toBeNull();
  });
});
