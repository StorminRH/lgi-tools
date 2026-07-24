import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import {
  defineEndpoint,
  emptyBody,
  endpointUrl,
  jsonBody,
  parseQueryInput,
  problem,
  textBody,
  type DeclaredStatus,
  type OutcomeOf,
  type PathParamKeys,
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

const getEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/test/typed',
  request: null,
  responses: {
    200: jsonBody(responseSchema),
  },
});

describe('endpoint contracts', () => {
  it('preserves literal statuses, request input, and per-status bodies', () => {
    expect(endpoint.path).toBe('/api/test/typed');
    expectTypeOf(endpoint.method).toEqualTypeOf<'POST'>();
    expectTypeOf(getEndpoint.method).toEqualTypeOf<'GET'>();
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

  it('prevents GET contracts from declaring a request body', () => {
    if (false) {
      // @ts-expect-error GET endpoint contracts cannot declare request bodies.
      defineEndpoint({
        method: 'GET',
        path: '/api/test/invalid-get',
        request: requestSchema,
        responses: {
          200: jsonBody(responseSchema),
        },
      });
    }
    expect(true).toBe(true);
  });
});

const querySchema = z.object({
  type: z.enum(['combat', 'gas']).optional(),
  size: z.coerce.number().int().optional(),
});

const queryEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/test/things',
  request: null,
  query: querySchema,
  responses: { 200: jsonBody(responseSchema) },
});

const pathEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/test/things/[id]',
  request: null,
  params: z.object({ id: z.string() }),
  responses: { 200: jsonBody(responseSchema) },
});

const nestedPathEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/test/things/[thingId]/parts/[partId]',
  request: null,
  params: z.object({ thingId: z.string(), partId: z.string() }),
  responses: { 200: jsonBody(responseSchema) },
});

describe('path parameter binding', () => {
  it('extracts every [segment] name from a path template', () => {
    expectTypeOf<PathParamKeys<'/api/test/things'>>().toEqualTypeOf<never>();
    expectTypeOf<PathParamKeys<'/api/test/things/[id]'>>().toEqualTypeOf<'id'>();
    expectTypeOf<
      PathParamKeys<'/api/test/things/[thingId]/parts/[partId]'>
    >().toEqualTypeOf<'thingId' | 'partId'>();
  });

  it('rejects a dynamic path whose params schema is missing or mismatched', () => {
    if (false) {
      // @ts-expect-error A [segment] path template requires a matching params schema.
      defineEndpoint({
        method: 'GET',
        path: '/api/test/things/[id]',
        request: null,
        responses: { 200: jsonBody(responseSchema) },
      });
      defineEndpoint({
        method: 'GET',
        path: '/api/test/things/[id]',
        request: null,
        // @ts-expect-error The params schema key must match the path template's [segment].
        params: z.object({ slug: z.string() }),
        responses: { 200: jsonBody(responseSchema) },
      });
      defineEndpoint({
        method: 'GET',
        path: '/api/test/things',
        request: null,
        // @ts-expect-error A static path template cannot declare params keys.
        params: z.object({ id: z.string() }),
        responses: { 200: jsonBody(responseSchema) },
      });
    }
    expect(true).toBe(true);
  });
});

describe('endpointUrl', () => {
  it('returns the declared path unchanged when nothing is supplied', () => {
    expect(endpointUrl(queryEndpoint, {})).toBe('/api/test/things');
  });

  it('substitutes path parameters and percent-encodes their values', () => {
    expect(endpointUrl(pathEndpoint, { params: { id: 'a b/c' } })).toBe(
      '/api/test/things/a%20b%2Fc',
    );
    expect(
      endpointUrl(nestedPathEndpoint, { params: { thingId: '7', partId: '9' } }),
    ).toBe('/api/test/things/7/parts/9');
  });

  it('appends declared query keys and omits undefined values', () => {
    expect(endpointUrl(queryEndpoint, { query: { type: 'gas', size: 3 } })).toBe(
      '/api/test/things?type=gas&size=3',
    );
    expect(endpointUrl(queryEndpoint, { query: { type: undefined, size: 3 } })).toBe(
      '/api/test/things?size=3',
    );
    expect(endpointUrl(queryEndpoint, { query: {} })).toBe('/api/test/things');
  });

  it('requires exactly the declared parameters and rejects undeclared keys', () => {
    if (false) {
      // @ts-expect-error A dynamic endpoint requires its path parameters.
      endpointUrl(pathEndpoint, {});
      // @ts-expect-error Path parameter keys must match the path template.
      endpointUrl(pathEndpoint, { params: { slug: '1' } });
      // @ts-expect-error Every declared path parameter must be supplied.
      endpointUrl(nestedPathEndpoint, { params: { thingId: '7' } });
      // @ts-expect-error Query keys must come from the endpoint's query schema.
      endpointUrl(queryEndpoint, { query: { sort: 'name' } });
      // @ts-expect-error Query values must satisfy the declared schema input.
      endpointUrl(queryEndpoint, { query: { type: 'relic' } });
      // @ts-expect-error An endpoint without a query schema accepts no query input.
      endpointUrl(pathEndpoint, { params: { id: '1' }, query: { type: 'gas' } });
      // @ts-expect-error An endpoint without a path template accepts no params.
      endpointUrl(queryEndpoint, { params: { id: '1' } });
    }
    expect(true).toBe(true);
  });
});

describe('parseQueryInput', () => {
  it('reads exactly the schema keys and maps absent parameters to undefined', () => {
    const parsed = parseQueryInput(
      queryEndpoint,
      new URLSearchParams({ type: 'gas', sort: 'name' }),
    );

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({ type: 'gas' });
      expectTypeOf(parsed.data.type).toEqualTypeOf<'combat' | 'gas' | undefined>();
    }
  });

  it('fails when a declared parameter violates its schema', () => {
    const parsed = parseQueryInput(queryEndpoint, new URLSearchParams({ type: 'relic' }));

    expect(parsed.success).toBe(false);
  });
});
