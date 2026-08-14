import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

describe('convexClient construction', () => {
  it('builds with a custom logger so DefaultLogger never calls Math.random', async () => {
    // The module under test constructs at import time from NEXT_PUBLIC_CONVEX_URL.
    // Isolate the random call that Next Cache Components flags during prerender.
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.42);
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', 'https://example.convex.cloud');

    const { convexClient } = await import('./client');

    expect(convexClient).not.toBeNull();
    expect(random).not.toHaveBeenCalled();

    random.mockRestore();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('reuses the first mint on connect', () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'client.ts'), 'utf8');
    expect(source).toContain('initialAuthTokenReuse: true');
  });
});
