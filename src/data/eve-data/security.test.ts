import { describe, expect, it } from 'vitest';
import { roundSecurityStatus, securityStatusTextClass, systemSecurityClass } from './security';

describe('system security classification and CCP display tokens', () => {
  it('bands hi/low/null/wormhole/K-space/Pochven from status + class id', () => {

    expect(systemSecurityClass(1.0, null)).toBe('high');
    expect(systemSecurityClass(0.5, null)).toBe('high');
    expect(systemSecurityClass(0.45, null)).toBe('high');

    expect(systemSecurityClass(0.4, null)).toBe('low');
    expect(systemSecurityClass(0.1, null)).toBe('low');
    expect(systemSecurityClass(0.01, null)).toBe('low');

    expect(systemSecurityClass(0.0, null)).toBe('null');
    expect(systemSecurityClass(-0.5, null)).toBe('null');
    expect(systemSecurityClass(-1.0, null)).toBe('null');

    for (const classId of [1, 2, 3, 4, 5, 6, 12, 13, 14, 15, 16, 17, 18]) {
      expect(systemSecurityClass(-1.0, classId)).toBe('wormhole');
    }

    expect(systemSecurityClass(0.9, 7)).toBe('high');
    expect(systemSecurityClass(0.3, 8)).toBe('low');
    expect(systemSecurityClass(-0.2, 9)).toBe('null');

    expect(systemSecurityClass(-0.6, 25)).toBe('null');

    expect(systemSecurityClass(null, null)).toBe('high');
  });

  it('rounds like the in-game display', () => {
    expect(roundSecurityStatus(0)).toBe(0);
    expect(roundSecurityStatus(0.04)).toBe(0.1);
    expect(roundSecurityStatus(0.45)).toBe(0.5);
    expect(roundSecurityStatus(-0.99)).toBe(-1.0);
    expect(securityStatusTextClass(null)).toBe('text-muted');
  });
});
