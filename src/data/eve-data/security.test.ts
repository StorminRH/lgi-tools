import { describe, expect, it } from 'vitest';
import {
  formatSecurityStatus,
  securityBand,
  securityStatusTextClass,
  systemSecurityClass,
} from './security';

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

  it('formats one decimal with CCP rounding, with a dash for unknown security', () => {
    expect(formatSecurityStatus(0.9)).toBe('0.9');
    expect(formatSecurityStatus(0)).toBe('0.0');
    expect(formatSecurityStatus(0.04)).toBe('0.1');
    expect(formatSecurityStatus(0.45)).toBe('0.5');
    expect(formatSecurityStatus(-0.99)).toBe('-1.0');
    expect(formatSecurityStatus(null)).toBe('—');
    expect(securityStatusTextClass(null)).toBe('text-muted');
  });

  it('bands the rounded display value for colour tokens', () => {
    expect(
      [1.0, 0.946, 0.85, 0.45, 0.44, 0.05, 0.04, 0.0, -0.4].map(securityBand),
    ).toEqual(['10', '09', '09', '05', '04', '01', '01', 'null', 'null']);
    expect(securityStatusTextClass(0.43)).toBe('text-sec-04');
    expect(securityStatusTextClass(-1)).toBe('text-sec-null');
  });
});
