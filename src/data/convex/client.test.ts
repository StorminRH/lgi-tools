import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('convexClient construction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('builds with a custom logger and reuses the first mint on connect', async () => {

    const random = vi.spyOn(Math, 'random').mockReturnValue(0.42);
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', 'https://example.convex.cloud');

    const { convexClient } = await import('./client');

    expect(convexClient).not.toBeNull();
    expect(random).not.toHaveBeenCalled();

    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'client.ts'), 'utf8');
    expect(source).toContain('initialAuthTokenReuse: true');
  });
});
