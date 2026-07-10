import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseFormBody, parseJsonBody } from './route-body';

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

describe('parseJsonBody with a JSON error contract', () => {
  const errors = {
    invalidJson: () => Response.json({ error: 'invalid_json' }, { status: 400 }),
    invalidBody: (error: z.ZodError) =>
      Response.json({ error: 'invalid_request', issues: error.issues }, { status: 400 }),
  };

  it('still returns typed data for a valid body', async () => {
    const r = await parseJsonBody(req(JSON.stringify({ name: 'azbel', count: 2 })), schema, errors);
    expect(r).toEqual({ ok: true, data: { name: 'azbel', count: 2 } });
  });

  it('returns the caller-built invalid_json envelope', async () => {
    const r = await parseJsonBody(req('{not valid json'), schema, errors);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(400);
      expect(await r.response.json()).toEqual({ error: 'invalid_json' });
    }
  });

  it('hands the ZodError to the invalid-body envelope with every issue', async () => {
    const r = await parseJsonBody(req(JSON.stringify({ name: '', count: 'x' })), schema, errors);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const body = (await r.response.json()) as { error: string; issues: unknown[] };
      expect(body.error).toBe('invalid_request');
      expect(body.issues.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('parseFormBody', () => {
  const formSchema = z.object({ characterId: z.coerce.number().int().positive() });
  const formReq = (fields: Record<string, string>) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    return new Request('http://test/api', { method: 'POST', body: form });
  };
  const invalid = () => new Response('Invalid character', { status: 400 });

  it('returns the validated data from the picked fields', async () => {
    const r = await parseFormBody(
      formReq({ characterId: '90000001' }),
      formSchema,
      (form) => ({ characterId: form.get('characterId') }),
      invalid,
    );
    expect(r).toEqual({ ok: true, data: { characterId: 90000001 } });
  });

  it('returns the caller-built 400 on a schema mismatch', async () => {
    const r = await parseFormBody(
      formReq({ characterId: 'not-a-number' }),
      formSchema,
      (form) => ({ characterId: form.get('characterId') }),
      invalid,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(400);
      expect(await r.response.text()).toBe('Invalid character');
    }
  });

  it('hands the ZodError to the error builder for per-field copy', async () => {
    const r = await parseFormBody(
      formReq({}),
      formSchema,
      (form) => ({ characterId: form.get('characterId') }),
      (error) => new Response(`Invalid ${error.issues[0]?.path.join('.') ?? 'form'}`, { status: 400 }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(await r.response.text()).toBe('Invalid characterId');
  });
});
