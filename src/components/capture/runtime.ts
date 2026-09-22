import type { ConfigRules } from '../domain/models';
import type { PreparedPanelConfig } from '../infrastructure/config/configSetup';
import type { CaptureTicket } from './session';
import { EvaluationTrace } from './trace';
import { guardTrace } from './guardTrace';
import { buildSnapshot, SnapshotInput } from './snapshot';
import { prepareDiagram, collectDiagram, attachDiagram } from './diagram';

export interface CapturePublication {
  commit(root: Element | null, view: string): void;
}

/** Использует уже подготовленные правила: не повторяет selectors или вычисления. */
export function createTrace(
  rules: ConfigRules[],
  prepared: PreparedPanelConfig,
  onFailure: () => void
): EvaluationTrace {
  const trace = guardTrace(new EvaluationTrace(rules), onFailure);
  const bySource = new Map(rules.map((rule) => [rule.source, rule]));
  for (const [id, variants] of prepared.rulesByElementId) {
    for (const variant of variants) {
      const authored = variant.source ? bySource.get(variant.source) : undefined;
      if (!authored) {
        throw new Error('CAPTURE_RULE_SOURCE_UNRESOLVED');
      }
      trace.preparedRule(authored, variant, id);
    }
  }
  return trace;
}

export type PublicationInput = Omit<SnapshotInput, 'diagram' | 'observed'> & {
  observed: Omit<SnapshotInput['observed'], 'generation'>;
};

export function createPublication(initial: CaptureTicket, input: PublicationInput, svg: string): CapturePublication {
  let ticket = initial;
  let previousView: string | undefined;
  let source: ReturnType<typeof prepareDiagram> | undefined;
  return {
    commit(root, view) {
      if (!ticket.current() || view === previousView) {
        return;
      }
      if (previousView !== undefined) {
        // Resize обновляет только наблюдаемый рисунок; формулы повторно не исполняются.
        ticket = ticket.connection.begin({
          effectiveFromMs: input.observed.effectiveFromMs,
          effectiveToMs: input.observed.effectiveToMs,
        });
      }
      previousView = view;
      const current = ticket;
      source ??= prepareDiagram(svg);
      void source
        .then((prepared) => {
          if (!current.current()) {
            return;
          }
          current.publish(() => {
            const snapshot = buildSnapshot({
              ...input,
              observed: { ...input.observed, generation: current.generation },
              diagram: {
                status: 'missing',
                coordinateSpace: null,
                viewport: null,
                items: [],
                connections: [],
                diagnosticIds: [],
              },
            });
            return attachDiagram(
              snapshot,
              collectDiagram({ source: prepared, root, mode: input.panel.mode, rules: snapshot.configuration.rules })
            );
          });
        })
        .catch(() => current.fail());
    },
  };
}
