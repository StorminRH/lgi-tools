import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'auth.ts'), 'utf8');

describe('Convex website JWT config', () => {
  it('mints a session-length token without Neon character enrichment', () => {
    const jwtStart = source.indexOf('jwt({');
    const payloadStart = source.indexOf('definePayload:', jwtStart);
    const payloadEnd = source.indexOf('adapter:', payloadStart);
    const jwtEnd = source.indexOf('disableSettingJwtHeader', jwtStart);
    expect(jwtStart).toBeGreaterThan(-1);
    expect(payloadStart).toBeGreaterThan(jwtStart);
    const jwtBlock = source.slice(jwtStart, jwtEnd);
    const payloadBlock = source.slice(payloadStart, payloadEnd);
    expect(jwtBlock).toContain("expirationTime: '7d'");
    expect(jwtBlock).toContain('getCachedJwks');
    expect(payloadBlock).not.toContain('resolveActiveCharacter');
    expect(payloadBlock).toContain('name: u.name');
  });
});
