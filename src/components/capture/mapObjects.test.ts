import { collectMapObjects } from './mapObjects';
import { MapMeasurements } from './mapMeasurements';

it('[V26] does not measure another panel when its root is absent', () => {
  const foreign = document.createElement('div');
  const navigation = jest.fn();
  expect(
    collectMapObjects({
      root: null,
      targets: new Map([['same', foreign]]),
      dynamicText: new Set(),
      indicators: [],
      navigation,
    })
  ).toEqual([]);
  expect(navigation).not.toHaveBeenCalled();
});

it('[V27] skips SVG resource subtrees and rejects pathological nesting before layout', () => {
  const root = new DOMParser().parseFromString(
    '<svg xmlns="http://www.w3.org/2000/svg"><defs><text>Resource</text></defs><text>Caption</text></svg>',
    'image/svg+xml'
  ).documentElement;
  expect(new MapMeasurements(root).elements().map((n) => n.localName)).toEqual(['svg', 'text']);
  let node: Element = root;
  for (let i = 0; i < 258; i++) {
    const child = node.ownerDocument.createElement('g');
    node.appendChild(child);
    node = child;
  }
  expect(() => new MapMeasurements(root).elements()).toThrow('CAPTURE_SVG_COMPLEXITY_LIMIT');
});
