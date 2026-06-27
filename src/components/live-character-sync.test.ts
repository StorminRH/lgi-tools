import { describe, expect, it } from 'vitest';
import { emptyDataText, mergeLiveById, syncErrorMeta } from './live-character-sync';

describe('syncErrorMeta', () => {
  it('maps the recorded sync-error codes', () => {
    expect(syncErrorMeta('reauth_required').label).toBe('Reconnect needed');
    expect(syncErrorMeta('budget_exhausted').label).toBe('ESI budget exhausted');
    expect(syncErrorMeta('reauth_required').tone).toBe('red');
  });

  it('falls back for unrecognized codes (raw esi_4xx)', () => {
    expect(syncErrorMeta('esi_403').label).toBe('Sync failed (esi_403)');
    expect(syncErrorMeta('esi_403').tone).toBe('orange');
  });
});

describe('emptyDataText', () => {
  it('tells a reconnect-needed character it will never sync', () => {
    expect(emptyDataText(true, false)).toBe('Nothing synced for this character.');
    // reconnect wins even mid-sync
    expect(emptyDataText(true, true)).toBe('Nothing synced for this character.');
  });

  it('distinguishes an in-flight sync from a pre-first-sync wait', () => {
    expect(emptyDataText(false, true)).toBe('Syncing…');
    expect(emptyDataText(false, false)).toBe('Awaiting first sync.');
  });
});

// The COLD payload query and HOT run-state query are two reactive subscriptions
// (SA.5). mergeLiveById joins them by entity id into the single per-entity shape
// the panels consume; these cover the union/default logic the merge hooks rely on.
describe('mergeLiveById', () => {
  it('joins each hot row with its cold payload by id', () => {
    const cold = [
      { id: 1, data: { totalSp: 100 } },
      { id: 2, data: { totalSp: 200 } },
    ];
    const hot = [
      { id: 1, lastSyncedAt: 10, syncError: null },
      { id: 2, lastSyncedAt: 20, syncError: 'esi_500' },
    ];
    expect(mergeLiveById(cold, hot)).toEqual([
      { id: 1, data: { totalSp: 100 }, lastSyncedAt: 10, syncError: null },
      { id: 2, data: { totalSp: 200 }, lastSyncedAt: 20, syncError: 'esi_500' },
    ]);
  });

  it('surfaces a hot row with no cold payload as data: null (unfetched / needs_role)', () => {
    const hot = [{ id: 7, lastSyncedAt: null, syncError: 'needs_role' }];
    expect(mergeLiveById<{ totalSp: number }>([], hot)).toEqual([
      { id: 7, data: null, lastSyncedAt: null, syncError: 'needs_role' },
    ]);
  });

  it('defensively surfaces a cold-only id (one-tick subscription skew) with null meta', () => {
    const cold = [{ id: 9, data: { totalSp: 5 } }];
    expect(mergeLiveById(cold, [])).toEqual([
      { id: 9, data: { totalSp: 5 }, lastSyncedAt: null, syncError: null },
    ]);
  });

  it('preserves hot order and appends cold-only ids after it', () => {
    const cold = [
      { id: 2, data: 'b' },
      { id: 3, data: 'c' },
    ];
    const hot = [
      { id: 1, lastSyncedAt: 1, syncError: null },
      { id: 2, lastSyncedAt: 2, syncError: null },
    ];
    expect(mergeLiveById(cold, hot).map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it('returns an empty list when both halves are empty', () => {
    expect(mergeLiveById([], [])).toEqual([]);
  });
});
