import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { validationFailure } from '@/lib/failure';
import { parseFormBody, readJsonBody } from './route-body';

const schema = z.object({ name: z.string().min(1), count: z.number() });
const req = (body: string) =>
  new Request('http://test/api', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json' },
  });

describe('readJsonBody', () => {
  it('returns typed validation failures without constructing a Response', async () => {
    const invalidJson = await readJsonBody(req('{not valid json'), schema);
    expect(invalidJson).toMatchObject({
      ok: false,
      failure: {
        category: 'validation',
        code: 'invalid_json',
        detail: 'Invalid JSON',
      },
    });

    const invalidBody = await readJsonBody(
      req(JSON.stringify({ name: '', count: 'x' })),
      schema,
    );
    expect(invalidBody).toMatchObject({
      ok: false,
      failure: {
        category: 'validation',
        code: 'invalid_body',
      },
      zodError: expect.anything(),
    });
  });
});

describe('parseFormBody', () => {
  const formSchema = z.object({ characterId: z.coerce.number().int().positive() });
  const formReq = (fields: Record<string, string>) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    return new Request('http://test/api', { method: 'POST', body: form });
  };
  const invalid = () =>
    validationFailure('invalid_form_field', 'Invalid character');

  it('returns the validated data from the picked fields', async () => {
    const r = await parseFormBody(
      formReq({ characterId: '90000001' }),
      formSchema,
      (form) => ({ characterId: form.get('characterId') }),
      invalid,
    );
    expect(r).toEqual({ ok: true, data: { characterId: 90000001 } });
  });

  it('returns the caller-built failure on a schema mismatch', async () => {
    const r = await parseFormBody(
      formReq({ characterId: 'not-a-number' }),
      formSchema,
      (form) => ({ characterId: form.get('characterId') }),
      invalid,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failure).toEqual({
        category: 'validation',
        code: 'invalid_form_field',
        detail: 'Invalid character',
      });
    }
  });

  it('hands the ZodError to the failure builder for per-field copy', async () => {
    const r = await parseFormBody(
      formReq({}),
      formSchema,
      (form) => ({ characterId: form.get('characterId') }),
      (error) =>
        validationFailure(
          'invalid_form_field',
          `Invalid ${error.issues[0]?.path.join('.') ?? 'form'}`,
        ),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.detail).toBe('Invalid characterId');
  });
});
