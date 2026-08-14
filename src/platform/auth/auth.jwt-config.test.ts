import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'auth.ts'), 'utf8');

describe('Convex website JWT config', () => {
  it('mints a session-length token without Neon character enrichment', () => {
    const jwtStart = source.indexOf('jwt({');
    const customSessionStart = source.indexOf('customSession(');
    expect(jwtStart).toBeGreaterThan(-1);
    expect(customSessionStart).toBeGreaterThan(jwtStart);
    const jwtBlock = source.slice(jwtStart, customSessionStart);
    expect(jwtBlock).toContain("expirationTime: '7d'");
    expect(jwtBlock).toContain('getCachedJwks');
    expect(jwtBlock).not.toContain('resolveActiveCharacter');
  });
});
