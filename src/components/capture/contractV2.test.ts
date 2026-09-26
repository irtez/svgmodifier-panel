import { readFileSync } from 'fs';
import { resolve } from 'path';
import { validateSnapshotV2 } from './testing/validateSnapshotV2';

const fixture = () => JSON.parse(readFileSync(resolve(__dirname, '../../../docs/examples/capture-v2.json'), 'utf8'));
const context = { panelId: 7, maxPayloadBytes: 4 * 1024 * 1024 };
const set = (value: any, path: string, replacement: unknown) => {
  const parts = path.split('.');
  const last = parts.pop()!;
  parts.reduce((v, k) => v[k], value)[last] = replacement;
};

describe('compact capture v2 contract', () => {
  it('accepts precise values, static objects and unavailable metrics together', () => {
    expect(validateSnapshotV2(fixture(), context)).toEqual([]);
  });

  it.each([
    ['schemaVersion', 1, 'schema'],
    ['diagram', {}, 'schema'],
    ['metrics.0.settings', {}, 'schema'],
    ['metrics.0.points', [], 'schema'],
    ['indicators.0.appearance.0.fill.rgba.3', 2, 'schema'],
    ['indicators.0.appearance.0.fill.kind', 'none', 'state'],
    ['metrics.0.scalar.value', NaN, 'json'],
    ['metrics.0.scalar.value', Infinity, 'json'],
    ['metrics.0.scalar.value', undefined, 'json'],
    ['producer.id', 'other', 'schema'],
    ['observed.generation', 0, 'schema'],
    ['observed.effectiveFromMs', 1001, 'range'],
    ['observed.dataState', 'Loading', 'schema'],
    ['objects.0.indicatorIds', ['unknown'], 'reference'],
    ['objects.0.parentId', 'object-a', 'cycle'],
    ['indicators.0.metricIds', ['unknown'], 'reference'],
    ['indicators.0.objectIds', ['unknown'], 'reference'],
    ['indicators.0.state.winnerMetricId', 'metric-missing', 'winner'],
    ['indicators.0.state.winnerRowIndex', 0, 'winner'],
    ['indicators.0.state.noData', true, 'winner'],
    ['indicators.0.navigation.0.linkId', 'unknown', 'reference'],
    ['metrics.0.ruleId', 'unknown', 'reference'],
    ['metrics.0.indicatorIds', [], 'binding'],
    ['metrics.0.availability', 'unavailable', 'state'],
    ['metrics.0.scalar', null, 'state'],
    ['metrics.0.scalar.appliedThreshold.index', -1, 'schema'],
    ['metrics.1.id', 'metric-a', 'duplicate'],
    ['diagnostics.0.causeIds', ['missing'], 'cycle'],
    ['diagnostics.0.metricIds', ['unknown'], 'reference'],
  ])('rejects invalid %s', (path, value, code) => {
    const snapshot = fixture();
    set(snapshot, path as string, value);
    expect(validateSnapshotV2(snapshot, context)).toContain(code);
  });

  it('does not confuse zero with an unavailable calculation', () => {
    const snapshot = fixture();
    snapshot.metrics[0].scalar.value = 0;
    expect(validateSnapshotV2(snapshot, context)).toEqual([]);
  });

  it('checks exact UTF-8 byte boundary and panel identity', () => {
    const snapshot = fixture(),
      bytes = Buffer.byteLength(JSON.stringify(snapshot), 'utf8');
    expect(validateSnapshotV2(snapshot, { ...context, maxPayloadBytes: bytes })).toEqual([]);
    expect(validateSnapshotV2(snapshot, { ...context, maxPayloadBytes: bytes - 1 })).toContain('size');
    expect(validateSnapshotV2(snapshot, { ...context, panelId: 8 })).toContain('identity');
  });
});
