import { describe, expect, it } from 'vitest';
import {
  describeSdeStandDown,
  formatSdeVersions,
  hasCompleteSdeData,
  shouldReingestSde,
} from './sde-bootstrap';

describe('formatSdeVersions', () => {
  it('renders both versions', () => {
    expect(formatSdeVersions('2026-05-01', '2026-05-08')).toBe(
      'SDE version stored=2026-05-01 remote=2026-05-08',
    );
  });

  it('renders <none>/<unreachable> for nulls', () => {
    expect(formatSdeVersions(null, null)).toBe('SDE version stored=<none> remote=<unreachable>');
  });
});

describe('hasCompleteSdeData', () => {
  it('is true only when every sentinel dataset has rows', () => {
    expect(hasCompleteSdeData({ typeDogma: 5500, npcStations: 5000, systemJumps: 8000 })).toBe(true);
  });

  it.each([
    { typeDogma: 0, npcStations: 5000, systemJumps: 8000 },
    { typeDogma: 5500, npcStations: 0, systemJumps: 8000 },
    { typeDogma: 5500, npcStations: 5000, systemJumps: 0 },
  ])('is false when any sentinel is empty (%o)', (counts) => {
    expect(hasCompleteSdeData(counts)).toBe(false);
  });
});

describe('describeSdeStandDown', () => {
  it('names the drift when the remote build differs from the stored one', () => {
    const msg = describeSdeStandDown('2026-05-01', '2026-05-08', '5595');
    expect(msg).toContain('deferred to the daily cron');
    expect(msg).toContain('stored=2026-05-01 remote=2026-05-08');
    expect(msg).toContain('5595 attribute rows');
  });

  it('reports <none> for an unset stored version on drift', () => {
    expect(describeSdeStandDown(null, '2026-05-08', '10')).toContain('stored=<none> remote=2026-05-08');
  });

  it('reports the unreachable manifest when the remote version is null', () => {
    const msg = describeSdeStandDown('2026-05-01', null, '5595');
    expect(msg).toContain('CCP SDE manifest unreachable');
    expect(msg).toContain('staying on stored version "2026-05-01"');
  });

  it('reports <none> when both stored and remote versions are unset', () => {
    expect(describeSdeStandDown(null, null, '0')).toContain(
      'staying on stored version "<none>"',
    );
  });

  it('reports already-current when stored and remote match', () => {
    const msg = describeSdeStandDown('2026-05-08', '2026-05-08', '5595');
    expect(msg).toContain('already at SDE version "2026-05-08"');
  });
});

describe('shouldReingestSde', () => {
  it('always re-ingests when forced', () => {
    expect(shouldReingestSde('2026-05-08', '2026-05-08', true)).toBe(true);
    expect(shouldReingestSde('2026-05-08', null, true)).toBe(true);
  });

  it('re-ingests on drift when unforced', () => {
    expect(shouldReingestSde('2026-05-01', '2026-05-08', false)).toBe(true);
  });

  it('is a no-op ONLY when unforced and a reachable remote confirms the versions match', () => {
    expect(shouldReingestSde('2026-05-08', '2026-05-08', false)).toBe(false);
  });

  it('re-ingests when the remote manifest is unreachable — an unreachable remote cannot confirm no-drift, so the manual recovery path loads data rather than no-op on a possibly-empty DB', () => {
    expect(shouldReingestSde('2026-05-08', null, false)).toBe(true);
  });

  it('re-ingests on a fresh/unversioned DB even when the remote is unreachable (both null)', () => {
    expect(shouldReingestSde(null, null, false)).toBe(true);
  });
});
