import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Convex JWT payload', () => {
  it('carries the user display name beside role without token material', () => {
    const source = readFileSync('src/platform/auth/auth.ts', 'utf8');
    const start = source.indexOf('definePayload:');
    const end = source.indexOf('disableSettingJwtHeader', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const payload = source.slice(start, end).replace(/\s+/g, '');
    expect(payload).toContain('role:');
    expect(payload).toContain('name:u.name');
    expect(payload).not.toMatch(/accessToken|refreshToken|eveToken/i);
  });
});
