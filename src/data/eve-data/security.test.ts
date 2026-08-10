import { describe, expect, it } from 'vitest';
import {
  roundSecurityStatus,
  securityStatusTextClass,
  systemSecurityClass,
} from './security';

describe('system security classification and CCP display tokens', () => {
  it('bands hi/low/null/wormhole/K-space/Pochven from status + class id', () => {
    // Hi-sec: 0.45 rounds up to hi-sec in-game.
    expect(systemSecurityClass(1.0, null)).toBe('high');
    expect(systemSecurityClass(0.5, null)).toBe('high');
    expect(systemSecurityClass(0.45, null)).toBe('high');
    // Low-sec: any positive status below the hi-sec cutoff.
    expect(systemSecurityClass(0.4, null)).toBe('low');
    expect(systemSecurityClass(0.1, null)).toBe('low');
    expect(systemSecurityClass(0.01, null)).toBe('low');
    // Null-sec at or below zero.
    expect(systemSecurityClass(0.0, null)).toBe('null');
    expect(systemSecurityClass(-0.5, null)).toBe('null');
    expect(systemSecurityClass(-1.0, null)).toBe('null');
    // C1–C6, Thera (12), shattered (13), and the Drifter complexes (14–18).
    for (const classId of [1, 2, 3, 4, 5, 6, 12, 13, 14, 15, 16, 17, 18]) {
      expect(systemSecurityClass(-1.0, classId)).toBe('wormhole');
    }
    // 7/8/9 = hi/low/null K-space — the band comes from the status, not the class id.
    expect(systemSecurityClass(0.9, 7)).toBe('high');
    expect(systemSecurityClass(0.3, 8)).toBe('low');
    expect(systemSecurityClass(-0.2, 9)).toBe('null');
    // Pochven (25) carries a class id but is status-banded — its negative sec lands null.
    expect(systemSecurityClass(-0.6, 25)).toBe('null');
    // Untagged system defaults to hi-sec.
    expect(systemSecurityClass(null, null)).toBe('high');
  });

  it('rounds like the in-game display and maps bands to CCP color tokens', () => {
    expect(roundSecurityStatus(0)).toBe(0);
    expect(roundSecurityStatus(0.04)).toBe(0.1);
    expect(roundSecurityStatus(0.45)).toBe(0.5);
    expect(roundSecurityStatus(-0.99)).toBe(-1.0);

    expect(securityStatusTextClass(1.0)).toBe('text-sec-10');
    expect(securityStatusTextClass(0.94)).toBe('text-sec-09');
    expect(securityStatusTextClass(0.5)).toBe('text-sec-05');
    expect(securityStatusTextClass(0.4)).toBe('text-sec-04');
    expect(securityStatusTextClass(0.1)).toBe('text-sec-01');
    expect(securityStatusTextClass(0)).toBe('text-sec-null');
    expect(securityStatusTextClass(-1)).toBe('text-sec-null');
    expect(securityStatusTextClass(null)).toBe('text-muted');
  });
});
