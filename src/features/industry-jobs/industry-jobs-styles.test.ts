import { describe, expect, it } from 'vitest';
import { JOB_STATUSES } from './esi-projection';
import { JOB_STATUS_META, jobActivityLabel, syncErrorMeta } from './industry-jobs-styles';

describe('JOB_STATUS_META', () => {
  it('covers every status the schema can store', () => {
    for (const status of JOB_STATUSES) {
      expect(JOB_STATUS_META[status].label).toBeTruthy();
      expect(JOB_STATUS_META[status].tone).toBeTruthy();
    }
  });
});

describe('jobActivityLabel', () => {
  it('labels the character-job activities off the shared map', () => {
    expect(jobActivityLabel(1)).toBe('Manufacturing');
    expect(jobActivityLabel(8)).toBe('Invention');
  });

  it('falls back generically for an unknown activity id', () => {
    expect(jobActivityLabel(999)).toBe('Industry');
  });
});

describe('syncErrorMeta', () => {
  it('maps the recorded sync-error codes', () => {
    expect(syncErrorMeta('reauth_required').label).toBe('Reconnect needed');
    expect(syncErrorMeta('budget_exhausted').label).toBe('ESI budget exhausted');
  });

  it('falls back for unrecognized codes (raw esi_4xx)', () => {
    expect(syncErrorMeta('esi_403').label).toBe('Sync failed (esi_403)');
  });
});
