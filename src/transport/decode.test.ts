import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { problemBodySchema } from '@/lib/problem';
import { decodeEndpointResponse, networkFailure } from './decode';
import {
  defineEndpoint,
  emptyBody,
  jsonBody,
  problem,
  textBody,
} from './endpoint';

const echoSchema = z.object({ value: z.string() });

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const problemResponseBody = (code = 'invalid_body', status = 400) =>
  problemBodySchema.parse({
    type: 'https://lgi.tools/problems/validation',
    title: 'Invalid request',
    status,
    code,
    correlationId: 'correlation-id',
  });

const endpoint = defineEndpoint({
  method: 'POST',
  path: '/api/test/decode',
  request: echoSchema,
  responses: {
    200: jsonBody(echoSchema),
    204: emptyBody(),
    400: problem('invalid_body'),
    409: problem(),
    503: textBody(),
  },
});

const emptyWireEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/test/empty-wire',
  request: null,
  responses: {
    200: emptyBody(),
  },
});

describe('decodeEndpointResponse', () => {
  it('returns the raw JSON body through the declared success arm', async () => {
    await expect(
      decodeEndpointResponse(endpoint, jsonResponse({ value: 'ok', extra: 1 })),
    ).resolves.toEqual({ ok: true, status: 200, data: { value: 'ok', extra: 1 } });
  });

  it('returns a declared problem through its API arm', async () => {
    await expect(
      decodeEndpointResponse(endpoint, jsonResponse(problemResponseBody(), 400)),
    ).resolves.toMatchObject({
      ok: false,
      kind: 'api',
      status: 400,
      error: { code: 'invalid_body' },
    });
  });

  it('accepts any code for an open problem vocabulary', async () => {
    await expect(
      decodeEndpointResponse(
        endpoint,
        jsonResponse(problemResponseBody('anything_at_all', 409), 409),
      ),
    ).resolves.toMatchObject({ ok: false, kind: 'api', status: 409 });
  });

  it('returns the text body for a declared text codec', async () => {
    await expect(
      decodeEndpointResponse(endpoint, new Response('service down', { status: 503 })),
    ).resolves.toMatchObject({ ok: false, kind: 'api', status: 503, error: 'service down' });
  });

  it('rejects an undeclared status as protocol drift', async () => {
    await expect(
      decodeEndpointResponse(endpoint, jsonResponse({ value: 'ok' }, 201)),
    ).resolves.toEqual({
      ok: false,
      kind: 'protocol',
      status: 201,
      detail: 'Endpoint returned an undeclared status',
    });
  });

  it('rejects invalid JSON as protocol drift', async () => {
    await expect(
      decodeEndpointResponse(endpoint, new Response('not json', { status: 200 })),
    ).resolves.toEqual({
      ok: false,
      kind: 'protocol',
      status: 200,
      detail: 'Endpoint returned invalid JSON',
    });
  });

  it('rejects a success body that fails its schema', async () => {
    await expect(
      decodeEndpointResponse(endpoint, jsonResponse({ value: 123 })),
    ).resolves.toEqual({
      ok: false,
      kind: 'protocol',
      status: 200,
      detail: 'Endpoint response failed its schema',
    });
  });

  it('rejects a body on an empty-codec status', async () => {
    // 204 forbids a body at the Response constructor, so the violation is
    // exercised on an endpoint that declares an empty codec for 200.
    await expect(
      decodeEndpointResponse(emptyWireEndpoint, new Response('unexpected', { status: 200 })),
    ).resolves.toEqual({
      ok: false,
      kind: 'protocol',
      status: 200,
      detail: 'Endpoint returned a body for an empty response',
    });
  });

  it('returns undefined data for a well-formed empty response', async () => {
    await expect(
      decodeEndpointResponse(endpoint, new Response(null, { status: 204 })),
    ).resolves.toEqual({ ok: true, status: 204, data: undefined });
  });

  it('rejects a problem body whose status disagrees with the wire status', async () => {
    await expect(
      decodeEndpointResponse(endpoint, jsonResponse(problemResponseBody('invalid_body', 409), 400)),
    ).resolves.toEqual({
      ok: false,
      kind: 'protocol',
      status: 400,
      detail: 'Endpoint returned an invalid problem body',
    });
  });

  it('rejects a problem code outside the declared vocabulary', async () => {
    await expect(
      decodeEndpointResponse(endpoint, jsonResponse(problemResponseBody('other_code'), 400)),
    ).resolves.toEqual({
      ok: false,
      kind: 'protocol',
      status: 400,
      detail: 'Endpoint returned an undeclared problem code',
    });
  });

  it('returns a network arm when a body stream fails mid-read', async () => {
    const response = jsonResponse({ value: 'ok' });
    vi.spyOn(response, 'json').mockRejectedValue(new TypeError('stream failed'));

    await expect(decodeEndpointResponse(endpoint, response)).resolves.toMatchObject({
      ok: false,
      kind: 'network',
      aborted: false,
    });
  });
});

describe('networkFailure', () => {
  it('flags abort errors and preserves the original cause', () => {
    const aborted = new DOMException('aborted', 'AbortError');
    const failed = new TypeError('Failed to fetch');

    expect(networkFailure(aborted)).toEqual({
      ok: false,
      kind: 'network',
      aborted: true,
      cause: aborted,
    });
    expect(networkFailure(failed)).toEqual({
      ok: false,
      kind: 'network',
      aborted: false,
      cause: failed,
    });
  });
});
