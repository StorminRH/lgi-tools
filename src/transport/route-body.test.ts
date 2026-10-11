import { expect, test } from 'vitest';
import { z } from 'zod';
import { parseFormBody, readJsonBody } from './route-body';

const schema = z.object({ name: z.string().min(1), count: z.number() });
const req = (body: string) =>
  new Request('http://test/api', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json' },
  });

const formReq = (fields: Record<string, string>) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return new Request('http://test/api', { method: 'POST', body: form });
};

test('readJsonBody returns typed validation failures without constructing a Response', async () => {
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

test('parseFormBody reads the listed fields and passes a missing one as undefined', async () => {
  const roleSchema = z.strictObject({
    characterId: z.coerce.number().int().positive(),
    q: z.string().max(20).optional(),
  });

  expect(
    await parseFormBody(
      formReq({ characterId: '90000001', q: 'hulk', unlisted: 'ignored' }),
      roleSchema,
      ['characterId', 'q'],
    ),
  ).toEqual({ ok: true, data: { characterId: 90000001, q: 'hulk' } });

  const withoutQuery = await parseFormBody(
    formReq({ characterId: '90000001' }),
    roleSchema,
    ['characterId', 'q'],
  );
  expect(withoutQuery).toEqual({ ok: true, data: { characterId: 90000001 } });
});

test('parseFormBody names the first failing field, or the form for a root-level issue', async () => {
  const characterSchema = z.object({ characterId: z.coerce.number().int().positive() });
  expect(
    await parseFormBody(
      formReq({ characterId: 'not-a-number' }),
      characterSchema,
      ['characterId'],
    ),
  ).toEqual({
    ok: false,
    failure: {
      category: 'validation',
      code: 'invalid_form_field',
      detail: 'Invalid characterId',
    },
  });

  const reviewSchema = z.union([
    z.object({
      action: z.enum(['promote', 'reject']),
      snapshotId: z.coerce.number().int().positive(),
    }),
    z.object({
      action: z.literal('refresh'),
      snapshotId: z.undefined().optional(),
    }),
  ]);
  expect(
    await parseFormBody(formReq({ action: 'refresh' }), reviewSchema, [
      'action',
      'snapshotId',
    ]),
  ).toEqual({ ok: true, data: { action: 'refresh' } });
  expect(
    await parseFormBody(formReq({ action: 'promote' }), reviewSchema, [
      'action',
      'snapshotId',
    ]),
  ).toEqual({
    ok: false,
    failure: {
      category: 'validation',
      code: 'invalid_form_field',
      detail: 'Invalid form',
    },
  });
});

test('parseFormBody returns invalid_form for a body that is not a form', async () => {
  const characterSchema = z.object({ characterId: z.coerce.number().int().positive() });
  expect(
    await parseFormBody(
      req(JSON.stringify({ characterId: 90000001 })),
      characterSchema,
      ['characterId'],
    ),
  ).toEqual({
    ok: false,
    failure: {
      category: 'validation',
      code: 'invalid_form',
      detail: 'Invalid form body',
    },
  });
});
