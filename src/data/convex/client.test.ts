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

  it('reuses the first mint on connect', async () => {
    const ConvexReactClient = vi.fn().mockReturnValue({});
    vi.resetModules();
    vi.doMock('convex/react', () => ({ ConvexReactClient }));
    vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', 'https://example.convex.cloud');

    await import('./client');

    expect(ConvexReactClient).toHaveBeenCalledWith(
      'https://example.convex.cloud',
      expect.objectContaining({ initialAuthTokenReuse: true }),
    );

    vi.doUnmock('convex/react');
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
