import { ConfigRules, MetricData, TableMetricData } from 'components/domain/models';
import { getElementColor, getLabel, getLabelColor } from './helpers';
import { collectSvgUpdateTargets, applySvgUpdateTargets, SvgUpdateTargets, updateLinkForElement } from './updater';

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
  svgElement: SVGElement | null | undefined,
  attributes?: ConfigRules['attributes'],
  data?: MetricData | TableMetricData,
  paint?: { color: string; filling?: string }
) {
  return () => {
    if (!svgElement) {
      return;
    }

    const hasLink = attributes ? 'link' in attributes : false;
    const hasLabel = attributes ? 'label' in attributes : false;
    const hasLabelColor = attributes ? 'labelColor' in attributes : false;

    const label = getLabel(data, attributes?.label);
    const labelColor = getLabelColor(attributes?.labelColor, paint?.color ?? data?.color);
    const elementColors = getElementColor(paint?.color ?? data?.color, paint?.filling ?? data?.filling);

    updateLinkForElement(svgElement, hasLink ? attributes?.link?.toString() : undefined);

    const targets = getOrBuildTargets(svgElement);
    applySvgUpdateTargets(targets, [hasLabel, label], [hasLabelColor, labelColor], elementColors);
  };
}
