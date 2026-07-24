import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import {
  defineEndpoint,
  emptyBody,
  jsonBody,
  problem,
  textBody,
  type DeclaredStatus,
  type OutcomeOf,
  type RequestInputOf,
  type ResponseBodyFor,
} from './endpoint';

const requestSchema = z.object({ value: z.string() });
const responseSchema = z.object({ echoed: z.string() });

const endpoint = defineEndpoint({
  method: 'POST',
  path: '/api/test/typed',
  request: requestSchema,
  responses: {
    201: jsonBody(responseSchema),
    204: emptyBody(),
    400: problem('invalid_body', 'invalid_value'),
    409: textBody(),
  },
});

describe('endpoint contracts', () => {
  it('preserves literal statuses, request input, and per-status bodies', () => {
    expect(endpoint.path).toBe('/api/test/typed');
    expectTypeOf<DeclaredStatus<typeof endpoint>>().toEqualTypeOf<
      201 | 204 | 400 | 409
    >();
    expectTypeOf<RequestInputOf<typeof endpoint>>().toEqualTypeOf<{
      value: string;
    }>();
    expectTypeOf<ResponseBodyFor<typeof endpoint, 201>>().toEqualTypeOf<{
      echoed: string;
    }>();
    expectTypeOf<ResponseBodyFor<typeof endpoint, 204>>().toEqualTypeOf<
      undefined
    >();
    expectTypeOf<ResponseBodyFor<typeof endpoint, 400>['code']>().toEqualTypeOf<
      'invalid_body' | 'invalid_value'
    >();
    expectTypeOf<ResponseBodyFor<typeof endpoint, 409>>().toEqualTypeOf<string>();
  });

  it('derives a closed status-discriminated outcome union', () => {
    type Result = OutcomeOf<typeof endpoint>;
    expectTypeOf<Extract<Result, { ok: true; status: 201 }>['data']>().toEqualTypeOf<{
      echoed: string;
    }>();
    expectTypeOf<
      Extract<Result, { ok: false; kind: 'api'; status: 400 }>['error']['code']
    >().toEqualTypeOf<'invalid_body' | 'invalid_value'>();
    expectTypeOf<
      Extract<Result, { ok: false; kind: 'api'; status: 409 }>['error']
    >().toEqualTypeOf<string>();
  });

  it('keeps transforming schemas out of JSON response codecs', () => {
    if (false) {
      // @ts-expect-error Response codecs require identical Zod input and output types.
      jsonBody(z.string().transform((value) => value.length));
    }
    expect(true).toBe(true);
  });
});
