import { describe, expect, it } from 'vitest';
import { JOB_STATUSES } from './esi-projection';
import {
  JOB_STATUS_META,
  jobActivityLabel,
  jobActivityPill,
  jobCategory,
} from './industry-jobs-styles';

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

describe('jobActivityPill', () => {
  it('maps the three in-game activity families to their pill', () => {
    expect(jobActivityPill(1)).toEqual({ label: 'MFG', tone: 'blue' });
    expect(jobActivityPill(11)).toEqual({ label: 'RX', tone: 'green' });
    for (const science of [3, 4, 5, 8]) {
      expect(jobActivityPill(science)).toEqual({ label: 'SCI', tone: 'purple' });
    }
  });

  it('accepts activity 9 — what live ESI actually sends for reactions', () => {
    expect(jobActivityPill(9)).toEqual({ label: 'RX', tone: 'green' });
  });

  it('falls back to a neutral industry pill for unknown ids', () => {
    expect(jobActivityPill(999)).toEqual({ label: 'IND', tone: 'neutral' });
  });
});

describe('jobCategory', () => {
  it('maps activities to their tracked slot family', () => {
    expect(jobCategory(1)).toBe('manufacturing');
    expect(jobCategory(11)).toBe('reactions');
    for (const science of [3, 4, 5, 8]) expect(jobCategory(science)).toBe('science');
  });

  it('accepts activity 9 — what live ESI actually sends for reactions', () => {
    expect(jobCategory(9)).toBe('reactions');
  });

  it('returns null for an untracked activity id', () => {
    expect(jobCategory(999)).toBeNull();
  });
});
