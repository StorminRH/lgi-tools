import { describe, expect, it } from 'vitest';
import { isSkillsStale, SKILLS_TTL_MS } from './staleness';

const NOW = new Date('2026-06-28T12:00:00Z');

describe('isSkillsStale', () => {
  it('treats a never-synced character (null) as stale', () => {
    expect(isSkillsStale(null, NOW)).toBe(true);
  });

  it('is fresh just inside the TTL window', () => {
    const justInside = new Date(NOW.getTime() - SKILLS_TTL_MS + 1_000);
    expect(isSkillsStale(justInside, NOW)).toBe(false);
  });

  it('is stale just outside the TTL window', () => {
    const justOutside = new Date(NOW.getTime() - SKILLS_TTL_MS - 1_000);
    expect(isSkillsStale(justOutside, NOW)).toBe(true);
  });

  it('mirrors the verified 120s ESI cache', () => {
    expect(SKILLS_TTL_MS).toBe(120_000);
  });
});
