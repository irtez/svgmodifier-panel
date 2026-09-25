import type { ConfigRules } from '../domain/models';
import type { PreparedPanelConfig } from '../infrastructure/config/configSetup';
import type { CaptureTicket } from './session';
import { EvaluationTrace } from './trace';
import { guardTrace } from './guardTrace';
import { buildSnapshotV2, type SnapshotInputV2 } from './snapshotV2';

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

export type PublicationInput = Omit<SnapshotInputV2, 'root' | 'observed'> & {
  observed: Omit<SnapshotInputV2['observed'], 'generation'>;
};

export function createPublication(initial: CaptureTicket, input: PublicationInput): CapturePublication {
  let ticket = initial;
  let previousView: string | undefined;
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
      if (input.panel.mode !== 'svg') {
        current.fail('CAPTURE_MODE_UNSUPPORTED');
        return;
      }
      // Font loading can move labels after React has committed the SVG.
      void Promise.resolve(root?.ownerDocument.fonts?.ready)
        .then(() => {
          if (!current.current()) {
            return;
          }
          current.publish(() => {
            const snapshot = buildSnapshotV2({
              ...input,
              root,
              observed: { ...input.observed, generation: current.generation },
            });
            if (new Blob([JSON.stringify(snapshot)]).size > current.connection.maxPayloadBytes) {
              current.fail('CAPTURE_PAYLOAD_TOO_LARGE');
              throw new Error('CAPTURE_PAYLOAD_TOO_LARGE');
            }
            return snapshot;
          });
        })
        .catch(() => current.fail());
    },
  };
}
