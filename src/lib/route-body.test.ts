import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseJsonBody } from './route-body';

const schema = z.object({ name: z.string().min(1), count: z.number() });
const req = (body: string) =>
  new Request('http://test/api', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json' },
  });

describe('parseJsonBody', () => {
  it('returns the validated, typed data for a valid body', async () => {
    const r = await parseJsonBody(req(JSON.stringify({ name: 'azbel', count: 2 })), schema);
    expect(r).toEqual({ ok: true, data: { name: 'azbel', count: 2 } });
  });

  it('returns a 400 Response for invalid JSON', async () => {
    const r = await parseJsonBody(req('{not valid json'), schema);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(400);
      expect(await r.response.text()).toBe('Invalid JSON');
    }
  });

  it('returns a 400 Response naming the first failing field on a schema mismatch', async () => {
    const r = await parseJsonBody(req(JSON.stringify({ name: '', count: 'x' })), schema);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(400);
      expect(await r.response.text()).toContain('name');
    }
  });

  it('labels a top-level (no-path) issue as "body"', async () => {
    const r = await parseJsonBody(req(JSON.stringify('not an object')), schema);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(await r.response.text()).toContain('body');
  });
});
