import { ConfigRules, MetricData, TableMetricData } from 'components/domain/models';
import { getElementColor, getLabel, getLabelColor } from './helpers';
import { addLinkToElement, collectSvgUpdateTargets, applySvgUpdateTargets, SvgUpdateTargets } from './updater';

const targetsCache = new WeakMap<SVGElement, SvgUpdateTargets>();

function getOrBuildTargets(svgElement: SVGElement): SvgUpdateTargets {
  let targets = targetsCache.get(svgElement);
  if (!targets) {
    targets = collectSvgUpdateTargets(svgElement);
    targetsCache.set(svgElement, targets);
  }
  return targets;
}

export function createSvgUpdateOperation(
  svgElement: SVGElement,
  attributes: ConfigRules['attributes'],
  data: MetricData | TableMetricData
) {
  return () => {
    const hasLink = attributes ? 'link' in attributes : false;
    const hasLabel = attributes ? 'label' in attributes : false;
    const hasLabelColor = attributes ? 'labelColor' in attributes : false;

    const label = getLabel(data, attributes?.label);
    const labelColor = getLabelColor(attributes?.labelColor, data?.color);
    const elementColors = getElementColor(data?.color, data?.filling);

    hasLink && addLinkToElement(svgElement, attributes?.link?.toString());

    const targets = getOrBuildTargets(svgElement);
    applySvgUpdateTargets(targets, [hasLabel, label], [hasLabelColor, labelColor], elementColors);
  };
}
