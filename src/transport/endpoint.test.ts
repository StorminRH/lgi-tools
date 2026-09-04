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
  type EndpointDefinition,
  type JsonCodec,
  type OutcomeOf,
  type ParamsKeysOf,
  type PathParamKeys,
  type PathParamsBinding,
  type PathParamsOf,
  type QueryInputOf,
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
    const lengthFromString = z.string().transform((value) => value.length);
    expectTypeOf<z.input<typeof lengthFromString>>().not.toEqualTypeOf<
      z.output<typeof lengthFromString>
    >();
    expectTypeOf(lengthFromString).not.toExtend<z.ZodType<number, number>>();
  });

  it('prevents GET contracts from declaring a request body', () => {
    expectTypeOf<{
      method: 'GET';
      path: '/api/test/invalid-get';
      request: typeof requestSchema;
      responses: { 200: JsonCodec<z.output<typeof responseSchema>> };
    }>().not.toExtend<EndpointDefinition>();
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
    const slugParams = z.object({ slug: z.string() });
    type MissingParams = Omit<typeof pathEndpoint, 'params'>;
    type MismatchedParams = Omit<typeof pathEndpoint, 'params'> & {
      params: typeof slugParams;
    };
    type StaticWithParams = typeof queryEndpoint & {
      params: typeof pathEndpoint.params;
    };

    expectTypeOf<PathParamsBinding<MissingParams>>().toEqualTypeOf<{
      params: 'a [segment] in this path template needs a matching params key';
    }>();
    expectTypeOf<PathParamKeys<MismatchedParams['path']>>().not.toEqualTypeOf<
      ParamsKeysOf<MismatchedParams>
    >();
    expectTypeOf<PathParamsBinding<MismatchedParams>>().toEqualTypeOf<{
      params: 'a [segment] in this path template needs a matching params key';
    }>();
    expectTypeOf<PathParamsBinding<StaticWithParams>>().toEqualTypeOf<{
      params: 'declares a key this path template does not contain';
    }>();
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
    expectTypeOf<Record<string, never>>().not.toExtend<PathParamsOf<typeof pathEndpoint>>();
    expectTypeOf<{ params: { slug: '1' } }>().not.toExtend<
      PathParamsOf<typeof pathEndpoint>
    >();
    expectTypeOf<{ params: { thingId: '7' } }>().not.toExtend<
      PathParamsOf<typeof nestedPathEndpoint>
    >();
    expectTypeOf<
      NonNullable<QueryInputOf<typeof queryEndpoint>['query']>
    >().not.toHaveProperty('sort');
    expectTypeOf<{ query: { type: 'relic' } }>().not.toExtend<
      QueryInputOf<typeof queryEndpoint>
    >();
    expectTypeOf<{ query: { type: 'gas' } }>().not.toExtend<
      QueryInputOf<typeof pathEndpoint>
    >();
    expectTypeOf<{ params: { id: '1' } }>().not.toExtend<
      PathParamsOf<typeof queryEndpoint>
    >();
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
