import { describe, expect, it, test } from 'vitest';
import {
  describeSdeStandDown,
  formatSdeVersions,
  hasCompleteSdeData,
  shouldReingestSde,
} from './sde-bootstrap';

test('formatSdeVersions renders both versions, and <none>/<unreachable> for nulls', () => {
  expect(formatSdeVersions('2026-05-01', '2026-05-08')).toBe('SDE version stored=2026-05-01 remote=2026-05-08');
  expect(formatSdeVersions(null, null)).toBe('SDE version stored=<none> remote=<unreachable>');
});

describe('hasCompleteSdeData', () => {
  const complete = {
    typeDogma: 5500,
    npcStations: 5000,
    systemJumps: 8000,
    industryTargetFilters: 18,
    industryModifiers: 744,
    industryAssemblyLines: 100,
    industryInstallationTypes: 200,
  };

  it('is true only when every sentinel dataset has rows', () => {
    expect(hasCompleteSdeData(complete)).toBe(true);
  });

  it.each([
    { ...complete, typeDogma: 0 },
    { ...complete, npcStations: 0 },
    { ...complete, systemJumps: 0 },
    { ...complete, industryTargetFilters: 0 },
    { ...complete, industryModifiers: 0 },
    { ...complete, industryAssemblyLines: 0 },
    { ...complete, industryInstallationTypes: 0 },
  ])('is false when any sentinel is empty (%o)', (counts) => {
    expect(hasCompleteSdeData(counts)).toBe(false);
  });
});

test('describeSdeStandDown tells drift, an unreachable manifest, and already-current apart', () => {
  const drift = describeSdeStandDown('2026-05-01', '2026-05-08', '5595');
  expect(drift).toContain('deferred to the daily cron');
  expect(drift).toContain('stored=2026-05-01 remote=2026-05-08');
  expect(drift).toContain('5595 attribute rows');
  expect(describeSdeStandDown(null, '2026-05-08', '10')).toContain('stored=<none> remote=2026-05-08');

  const unreachable = describeSdeStandDown('2026-05-01', null, '5595');
  expect(unreachable).toContain('CCP SDE manifest unreachable');
  expect(unreachable).toContain('staying on stored version "2026-05-01"');
  expect(describeSdeStandDown(null, null, '0')).toContain('staying on stored version "<none>"');

  expect(describeSdeStandDown('2026-05-08', '2026-05-08', '5595')).toContain('already at SDE version "2026-05-08"');
});

test('shouldReingestSde is a no-op only when unforced and a reachable remote confirms the versions match', () => {
  expect(shouldReingestSde('2026-05-08', '2026-05-08', false)).toBe(false);
  expect(shouldReingestSde('2026-05-08', '2026-05-08', true)).toBe(true);
  expect(shouldReingestSde('2026-05-08', null, true)).toBe(true);
  expect(shouldReingestSde('2026-05-01', '2026-05-08', false)).toBe(true);
  // An unreachable remote cannot confirm no-drift, so the manual recovery path loads data.
  expect(shouldReingestSde('2026-05-08', null, false)).toBe(true);
  expect(shouldReingestSde(null, null, false)).toBe(true);
});
