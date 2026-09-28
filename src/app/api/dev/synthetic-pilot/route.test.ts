import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  becomeSyntheticPilot: vi.fn(),
}));

vi.mock('@/composition/synthetic-pilot-store', () => ({
  becomeSyntheticPilot: (...args: unknown[]) => h.becomeSyntheticPilot(...args),
}));

import { POST } from './route';

const COOKIE = 'better-auth.session_token=tok.sig; Domain=localhost; Path=/; Max-Age=604800; SameSite=Lax; HttpOnly';
const URL = 'http://localhost:3000/api/dev/synthetic-pilot';

beforeEach(() => {
  h.becomeSyntheticPilot.mockReset().mockResolvedValue({
    cookies: [],
    headers: new Headers({ 'Set-Cookie': COOKIE }),
  });
  vi.unstubAllEnvs();
  vi.stubEnv('NODE_ENV', 'development');
});

function request(url: string, host: string, origin: string | null): Request {
  const headers = new Headers({ host });
  if (origin !== null) headers.set('origin', origin);
  return new Request(url, { method: 'POST', headers });
}

describe('POST /api/dev/synthetic-pilot', () => {
  it.each([
    ['production', URL, 'localhost:3000', 'http://localhost:3000'],
    ['test', URL, 'localhost:3000', 'http://localhost:3000'],
    ['development', URL, '127.0.0.1:3000', 'http://localhost:3000'],
    ['development', URL, 'localhost:4000', 'http://localhost:3000'],
    ['development', URL, 'user@localhost:3000', 'http://localhost:3000'],
    ['development', URL, 'localhost:3000/path', 'http://localhost:3000'],
    ['development', 'http://evil.test/api/dev/synthetic-pilot', 'localhost:3000', 'http://evil.test'],
    ['development', URL, 'localhost:3000', null],
    ['development', URL, 'localhost:3000', 'null'],
    ['development', URL, 'localhost:3000', 'https://evil.test'],
    ['development', URL, 'localhost:3000', 'http://localhost:3001'],
    ['development', URL, 'localhost:3000', 'https://localhost:3000'],
    ['development', URL, 'localhost:3000', 'http://localhost:3000/path'],
  ])('rejects %s request to %s with Host %s and Origin %s', async (nodeEnv, url, host, origin) => {
    vi.stubEnv('NODE_ENV', nodeEnv);
    const response = await POST(request(url, host, origin));
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
    expect(response.headers.has('Set-Cookie')).toBe(false);
    expect(h.becomeSyntheticPilot).not.toHaveBeenCalled();
  });

  it('sets the issued cookie and redirects a same-origin development form home', async () => {
    const response = await POST(request(URL, 'localhost:3000', 'http://localhost:3000'));
    expect(response.status).toBe(303);
    expect(await response.text()).toBe('');
    expect(response.headers.get('Location')).toBe('/');
    expect(response.headers.get('Set-Cookie')).toBe(COOKIE);
    expect(h.becomeSyntheticPilot).toHaveBeenCalledOnce();
  });
});
