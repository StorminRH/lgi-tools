import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  becomeSyntheticPilot: vi.fn(),
}));

vi.mock('@/composition/synthetic-pilot-store', () => ({
  becomeSyntheticPilot: (...args: unknown[]) => h.becomeSyntheticPilot(...args),
}));

import { GET } from './route';

const ISSUED = {
  cookies: [
    {
      name: 'better-auth.session_token',
      value: 'tok.sig',
      domain: 'localhost' as const,
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax' as const,
      maxAgeSec: 604800,
    },
  ],
};

beforeEach(() => {
  h.becomeSyntheticPilot.mockReset().mockResolvedValue(ISSUED);
  vi.unstubAllEnvs();
});

function request(url: string, host: string): Request {
  return new Request(url, { headers: { host } });
}

describe('GET /api/dev/synthetic-pilot', () => {
  it('returns an empty 404 outside development localhost and mints on the allowed origin', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const production = await GET(
      request('http://localhost:3000/api/dev/synthetic-pilot', 'localhost:3000'),
    );
    expect(production.status).toBe(404);
    expect(await production.text()).toBe('');
    expect(h.becomeSyntheticPilot).not.toHaveBeenCalled();

    vi.stubEnv('NODE_ENV', 'development');
    const loopback = await GET(
      request('http://localhost:3000/api/dev/synthetic-pilot', '127.0.0.1:3000'),
    );
    expect(loopback.status).toBe(404);
    expect(await loopback.text()).toBe('');
    expect(h.becomeSyntheticPilot).not.toHaveBeenCalled();

    const minted = await GET(
      request('http://localhost:3000/api/dev/synthetic-pilot', 'localhost:3000'),
    );
    expect(minted.status).toBe(303);
    expect(minted.headers.get('Location')).toBe('http://localhost:3000/');
    expect(minted.headers.get('Set-Cookie')).toContain('better-auth.session_token=tok.sig');
    expect(minted.headers.get('Set-Cookie')).toContain('Domain=localhost');
    expect(h.becomeSyntheticPilot).toHaveBeenCalledOnce();
  });
});
