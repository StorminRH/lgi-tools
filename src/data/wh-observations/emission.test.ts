import { expect, it } from 'vitest';
import type { WormholeCodexEntry } from '@/data/eve-data/universe-assets';
import { observationFor, type ObservationFacts } from './emission';

const CODEX: WormholeCodexEntry[] = [
  {
    code: 'C247',
    typeId: 30_758,
    farSide: false,
    totalMass: 2_000_000_000,
    maxJumpMass: 300_000_000,
    massRegen: 0,
    lifetimeMinutes: 960,
    sizeClass: 'L',
    targetClass: 3,
  },
  { code: 'K162', typeId: 30_547, farSide: true },
];

function facts(overrides: Partial<ObservationFacts> = {}): ObservationFacts {
  return {
    typedSystemId: 31_000_001,
    whTypeCode: 'C247',
    provenance: 'assumed',
    dedupeKey: 'hole-key',
    destinationClassId: null,
    ...overrides,
  };
}

it('keeps attributable identifications and rejects every unattributable fact', () => {
  expect(observationFor(facts(), CODEX)).toEqual({
    solarSystemId: 31_000_001,
    whTypeCode: 'C247',
    provenance: 'assumed',
    dedupeKey: 'hole-key',
  });
  expect(observationFor(facts({ provenance: 'human' }), CODEX)).toMatchObject({
    provenance: 'human',
  });
  expect(
    observationFor(facts({ destinationClassId: 3 }), CODEX),
  ).toMatchObject({ whTypeCode: 'C247' });
  expect(observationFor(facts({ destinationClassId: 4 }), CODEX)).toBeNull();

  expect(observationFor(facts({ whTypeCode: null }), CODEX)).toBeNull();
  expect(observationFor(facts({ whTypeCode: 'K162' }), CODEX)).toBeNull();
  expect(observationFor(facts({ whTypeCode: 'ZZZZ' }), CODEX)).toBeNull();
  expect(observationFor(facts({ provenance: null }), CODEX)).toBeNull();
  expect(observationFor(facts({ dedupeKey: null }), CODEX)).toBeNull();
});
