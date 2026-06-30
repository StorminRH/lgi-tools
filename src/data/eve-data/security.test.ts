import { describe, expect, it } from 'vitest';
import { type SecurityClass, SECURITY_CLASSES, systemSecurityClass } from './security';

describe('systemSecurityClass', () => {
  it('classifies hi-sec from security status (0.45 rounds up to hi-sec)', () => {
    expect(systemSecurityClass(1.0, null)).toBe('high');
    expect(systemSecurityClass(0.5, null)).toBe('high');
    expect(systemSecurityClass(0.45, null)).toBe('high');
  });

  it('classifies low-sec for any positive status below the hi-sec cutoff', () => {
    expect(systemSecurityClass(0.4, null)).toBe('low');
    expect(systemSecurityClass(0.1, null)).toBe('low');
    expect(systemSecurityClass(0.01, null)).toBe('low');
  });

  it('classifies null-sec at or below zero', () => {
    expect(systemSecurityClass(0.0, null)).toBe('null');
    expect(systemSecurityClass(-0.5, null)).toBe('null');
    expect(systemSecurityClass(-1.0, null)).toBe('null');
  });

  it('classifies J-space wormhole classes regardless of security status', () => {
    // C1–C6, Thera (12), shattered (13), and the Drifter complexes (14–18).
    for (const classId of [1, 2, 3, 4, 5, 6, 12, 13, 14, 15, 16, 17, 18]) {
      expect(systemSecurityClass(-1.0, classId)).toBe('wormhole');
    }
  });

  it('treats the K-space class ids (7/8/9) and Pochven (25) as status-banded, not wormhole', () => {
    // 7/8/9 = hi/low/null K-space — the band comes from the status, not the class id.
    expect(systemSecurityClass(0.9, 7)).toBe('high');
    expect(systemSecurityClass(0.3, 8)).toBe('low');
    expect(systemSecurityClass(-0.2, 9)).toBe('null');
    // Pochven (25) carries a class id but is status-banded — its negative sec lands null.
    expect(systemSecurityClass(-0.6, 25)).toBe('null');
  });

  it('defaults an untagged system (null security status, no class) to hi-sec', () => {
    expect(systemSecurityClass(null, null)).toBe('high');
  });

  it('returns only declared security classes', () => {
    const all: SecurityClass[] = [
      systemSecurityClass(1.0, null),
      systemSecurityClass(0.3, null),
      systemSecurityClass(-1.0, null),
      systemSecurityClass(-1.0, 3),
    ];
    for (const band of all) expect(SECURITY_CLASSES).toContain(band);
  });
});
