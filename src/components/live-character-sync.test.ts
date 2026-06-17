import { describe, expect, it } from 'vitest';
import { emptyDataText, syncErrorMeta } from './live-character-sync';

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
