import { describe, expect, it } from 'vitest';
import type { SavedPlanRow } from './api-contract';
import { echoOutcome, SAVED_TILES_MAX, savedEmptyLine, savedTiles } from './saved-plans-view';

function plan(id: string, favorite = false): SavedPlanRow {
  return {
    id,
    name: `Plan ${id}`,
    favorite,
    blueprintTypeId: 691,
    productTypeId: 587,
    productName: 'Rifter',
    snapshot: { v: 1, blueprintTypeId: 691 },
    updatedAt: '2026-07-01T00:00:00Z',
  };
}

describe('savedTiles', () => {
  it('passes a short list through in the server order, no overflow', () => {
    const plans = [plan('b', true), plan('a')];
    expect(savedTiles(plans)).toEqual({ tiles: plans, overflow: 0 });
  });

  it('cuts to the first 8 preserving the server order byte-for-byte', () => {
    const plans = Array.from({ length: 11 }, (_, i) => plan(String(i)));
    const { tiles, overflow } = savedTiles(plans);
    expect(tiles).toEqual(plans.slice(0, SAVED_TILES_MAX));
    expect(overflow).toBe(3);
  });
});

describe('echoOutcome', () => {
  it('returns the echoed list on success', () => {
    const plans = [plan('a')];
    expect(echoOutcome({ ok: true, data: { plans } }, () => 'nope')).toEqual({ plans });
  });

  it('maps a failure status through the endpoint-specific copy', () => {
    expect(
      echoOutcome({ ok: false, status: 401 }, (status) => (status === 401 ? 'sign in' : 'other')),
    ).toEqual({ error: 'sign in' });
  });

  it('treats a network failure (null) as status 0', () => {
    expect(echoOutcome(null, (status) => `status ${status}`)).toEqual({ error: 'status 0' });
  });
});

describe('savedEmptyLine', () => {
  it('prioritizes the failed-read line', () => {
    expect(savedEmptyLine({ listFailed: true, signedOut: true })).toBe(
      "Couldn't load your saved templates",
    );
  });
  it('prompts sign-in for the settled anonymous viewer', () => {
    expect(savedEmptyLine({ listFailed: false, signedOut: true })).toBe(
      'Sign in to save build templates',
    );
  });
  it('hints where saving lives for a signed-in empty list', () => {
    expect(savedEmptyLine({ listFailed: false, signedOut: false })).toBe(
      'No saved templates yet — save one from the planner',
    );
  });
});
