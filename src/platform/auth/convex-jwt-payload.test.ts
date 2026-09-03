import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'auth.ts'), 'utf8');

describe('Convex website JWT config', () => {
  it('mints a session-length token with display name and role, without Neon character enrichment or token material', () => {
    const jwtStart = source.indexOf('jwt({');
    const payloadStart = source.indexOf('definePayload:', jwtStart);
    const payloadEnd = source.indexOf('adapter:', payloadStart);
    const jwtEnd = source.indexOf('disableSettingJwtHeader', jwtStart);
    expect(jwtStart).toBeGreaterThan(-1);
    expect(payloadStart).toBeGreaterThan(jwtStart);
    expect(jwtEnd).toBeGreaterThan(payloadStart);

    const jwtBlock = source.slice(jwtStart, jwtEnd);
    const payloadBlock = source.slice(payloadStart, payloadEnd);
    const payload = payloadBlock.replace(/\s+/g, '');

    expect(jwtBlock).toContain("expirationTime: '7d'");
    expect(jwtBlock).toContain('getCachedJwks');
    expect(payloadBlock).not.toContain('resolveActiveCharacter');
    expect(payload).toContain('role:');
    expect(payload).toContain('name:u.name');
    expect(payload).not.toMatch(/accessToken|refreshToken|eveToken/i);
  });
});
