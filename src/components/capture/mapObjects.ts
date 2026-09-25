import type { IndicatorV2, MapObjectV2, NavigationV2 } from './modelsV2';
import { MapMeasurements, appliedHref, area, encloses, union, type Box, type TextRow } from './mapMeasurements';

export interface MapInput {
  root: Element | null;
  targets: ReadonlyMap<string, Element>;
  dynamicText: ReadonlySet<Element>;
  indicators: IndicatorV2[];
  navigation: (url: string) => NavigationV2[];
}

export function collectMapObjects(input: MapInput): MapObjectV2[] {
  const { root, indicators, targets, navigation } = input;
  if (!root) {
    return [];
  }
  const measure = new MapMeasurements(root),
    nodes = measure.elements(),
    figures = measure.figures(nodes);
  const texts = measure.texts(nodes),
    objects: MapObjectV2[] = [];
  const add = (name: string | null, kind: MapObjectV2['kind']): MapObjectV2 => {
    const object: MapObjectV2 = {
      id: 'object-' + objects.length,
      kind,
      name: name ? { text: name, source: 'visible_text' } : null,
      indicatorIds: [],
      parentId: null,
      parentRelation: null,
      navigation: [],
    };
    objects.push(object);
    return object;
  };
  const closed = figures.filter(
    (f) =>
      ['rect', 'circle', 'ellipse', 'polygon'].includes(f.node.localName) ||
      (f.node.localName === 'path' && /[zZ]\s*$/.test(f.node.getAttribute('d') ?? ''))
  );
  // Use drawn enclosures only. Technical <g> and foreignObject bounds can cover neighbours.
  const smallest = (box: Box, exclude?: Element) => {
    const matches = closed
      .filter((f) => f.node !== exclude && area(f.box) > area(box) + 1 && encloses(f.box, box))
      .sort((a, b) => area(a.box) - area(b.box));
    return matches.filter((f) => Math.abs(area(f.box) - area(matches[0].box)) < 1);
  };
  const rows = texts
    .filter((text) => ![...input.dynamicText].some((n) => n.contains(text.node)))
    .map((text) => {
      const object = add(text.text, 'annotation');
      const url = appliedHref(text.node, root);
      if (url !== null) {
        object.navigation = navigation(url);
      }
      const cell = text.node.closest('[data-cell-id]');
      const owned = cell
        ? closed.filter((f) => f.node.closest('[data-cell-id]') === cell && encloses(f.box, text.box))
        : [];
      const containers = owned.length ? owned : smallest(text.box);
      return { text, object, container: containers.length === 1 ? containers[0] : null };
    });
  const groups = new Map<Element, MapObjectV2>();
  for (const figure of closed) {
    const contained = rows.filter((row) => row.container === figure);
    if (contained.length > 1) {
      const group = add(null, 'group');
      groups.set(figure.node, group);
      contained.forEach((row) => {
        row.object.parentId = group.id;
        row.object.parentRelation = 'inferred';
      });
    } else if (contained.length === 1) {
      groups.set(figure.node, contained[0].object);
    }
  }
  for (const [node, object] of groups) {
    const figure = closed.find((f) => f.node === node)!;
    const parents = smallest(figure.box, node)
      .map((f) => groups.get(f.node))
      .filter((o): o is MapObjectV2 => !!o && o !== object);
    if (parents.length === 1) {
      object.parentId = parents[0].id;
      object.parentRelation = 'inferred';
      parents[0].kind = 'group';
    }
  }
  for (const indicator of indicators) {
    const target = targets.get(indicator.id);
    if (!target || !root.contains(target)) {
      continue;
    }
    const ownFigures = figures.filter((f) => target.contains(f.node)),
      ownTexts = texts.filter((t) => target.contains(t.node));
    indicator.visible = measure.visible(target) && !!(ownFigures.length || ownTexts.length);
    if (!indicator.visible && indicator.tooltip.status !== 'disabled') {
      indicator.tooltip.status = 'not_rendered';
    }
    if (!indicator.visible) {
      continue;
    }
    const paints = [
      ...ownFigures.map((f) => measure.appearance(f.node, false)),
      ...ownTexts.map((t) => measure.appearance(t.node, true)),
    ];
    indicator.appearance = [...new Map(paints.map((p) => [JSON.stringify(p), p])).values()];
    const url = appliedHref(target, root);
    if (url !== null) {
      indicator.navigation.push(...navigation(url));
    }
    let candidates = rows.filter((row) => target.contains(row.text.node));
    let basis: IndicatorV2['binding']['basis'] = 'own_text';
    const box = union([...ownFigures.map((f) => f.box), ...ownTexts.map((t) => t.box)]);
    if (!candidates.length && box) {
      const containers = smallest(box);
      candidates = rows.filter((row) => row.container && containers.includes(row.container));
      basis = 'containment';
      if (candidates.length > 1) {
        const aligned = candidates.filter((row) => alignedRow(row.text, box));
        if (aligned.length) {
          candidates = aligned;
          basis = 'row_alignment';
        }
      }
    }
    if (candidates.length === 1) {
      const object = candidates[0].object;
      indicator.objectIds = [object.id];
      object.indicatorIds.push(indicator.id);
      if (object.kind === 'annotation') {
        object.kind = 'object';
      }
      indicator.binding = { status: basis === 'own_text' ? 'direct' : 'inferred', basis, candidateObjectIds: [] };
    } else if (candidates.length > 1) {
      indicator.binding = { status: 'ambiguous', basis, candidateObjectIds: candidates.map((c) => c.object.id) };
    }
  }
  return objects;
}

function alignedRow(text: TextRow, box: Box): boolean {
  const cy = box.y + box.height / 2;
  return cy >= text.box.y - text.box.height * 0.25 && cy <= text.box.y + text.box.height * 1.25;
}
