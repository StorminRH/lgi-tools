// Typed fetch for our own /api routes (3.4.T). Each JSON-speaking route's
// owning slice exports an ApiEndpoint from its api-contract.ts; callers go
// through apiFetch and get the contract's response type back — raw
// fetch('/api/…') is lint-banned. The helper deliberately changes nothing on
// the wire: same method/headers/body bytes as the call sites it replaced.
import type { z } from 'zod';
import { problemBodySchema } from '@/lib/problem';
import type {
  EndpointContract,
  OutcomeOf,
  RequestInputOf,
} from './endpoint';

/** Closed typed API outcome: validated success data or a declared error payload and HTTP status. */
export type ApiResult<TData> =
  | { ok: true; status: number; data: TData }
  // Body left unconsumed — callers branch on status and read .text() exactly
  // as they did against the raw Response.
  | { ok: false; status: number; response: Response };

/**
 * Typed same-origin endpoint contract pairing method, path, response schema, and optional request
 * schema in one authoritative definition.
 */
export interface ApiEndpoint<TIn, TData> {
  method: 'GET' | 'POST';
  path: string;
  // The route-side request schema (the route imports the same object and does
  // the parsing, as before). apiFetch uses ONLY its input type — outgoing
  // bodies are never client-parsed. null = the endpoint takes no body.
  // Zod 4 signature: ZodType<Output, Input> — the SECOND param is the input
  // type (Zod 3 had a three-param ZodType<O, Def, I> where the second was the
  // internal typedef; this code requires the installed Zod 4).
  request: z.ZodType<unknown, TIn> | null;
  // Success-body schema. Outside production it safeParses the body and
  // console.errors on drift; EVERY environment returns the raw json — never
  // the Zod output, so default-object key-stripping can't make dev differ
  // from prod. null = the success body is never read (204s / ignored bodies).
  response: z.ZodType<TData> | null;
}

type CallInit = Pick<RequestInit, 'signal' | 'cache' | 'keepalive'>;

/** Fetch arguments inferred from whether an endpoint declares a request body. */
export type EndpointCallArgs<TEndpoint extends EndpointContract> =
  TEndpoint['request'] extends null
    ? [init?: CallInit]
    : [init: CallInit & { body: RequestInputOf<TEndpoint> }];

/** Calls a v2 endpoint and returns its closed status-discriminated outcome. */
export async function apiFetch<const TEndpoint extends EndpointContract>(
  endpoint: TEndpoint,
  ...args: EndpointCallArgs<TEndpoint>
): Promise<OutcomeOf<TEndpoint>>;
/**
 * Calls a typed same-origin endpoint, validates its response contract, and returns the closed
 * success or API-error result without throwing for declared HTTP failures.
 */
export async function apiFetch<TData>(
  endpoint: ApiEndpoint<null, TData>,
  init?: CallInit,
): Promise<ApiResult<TData>>;
/**
 * Calls a typed same-origin endpoint, validates its response contract, and returns the closed
 * success or API-error result without throwing for declared HTTP failures.
 */
export async function apiFetch<TIn, TData>(
  endpoint: ApiEndpoint<TIn, TData>,
  init: CallInit & { body: TIn },
): Promise<ApiResult<TData>>;
export async function apiFetch(
  endpoint: ApiEndpoint<unknown, unknown> | EndpointContract,
  init: CallInit & { body?: unknown } = {},
): Promise<unknown> {
  if ('responses' in endpoint) {
    return executeEndpoint(endpoint, init);
  }

  const { body, ...rest } = init;
  const res = await fetch(endpoint.path, {
    method: endpoint.method,
    ...(endpoint.request !== null
      ? {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}),
    ...rest,
  });
  if (!res.ok) return { ok: false, status: res.status, response: res };
  if (endpoint.response === null) return { ok: true, status: res.status, data: undefined };
  const data: unknown = await res.json();
  if (process.env.NODE_ENV !== 'production') {
    const check = endpoint.response.safeParse(data);
    if (!check.success) {
      console.error(
        `[api-client] ${endpoint.method} ${endpoint.path} response drifted from its contract`,
        check.error,
      );
    }
  }
  return { ok: true, status: res.status, data };
}

function protocolFailure(status: number, detail: string) {
  return { ok: false, kind: 'protocol' as const, status, detail };
}

function isAbortError(cause: unknown): boolean {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'name' in cause &&
    cause.name === 'AbortError'
  );
}

function networkFailure(cause: unknown) {
  return {
    ok: false,
    kind: 'network' as const,
    aborted: isAbortError(cause),
    cause,
  };
}

async function readJson(
  response: Response,
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; kind: 'invalid-json' }
  | { ok: false; kind: 'network'; cause: unknown }
> {
  try {
    return { ok: true, data: await response.json() };
  } catch (cause) {
    return cause instanceof SyntaxError
      ? { ok: false, kind: 'invalid-json' }
      : { ok: false, kind: 'network', cause };
  }
}

async function executeEndpoint(
  endpoint: EndpointContract,
  init: CallInit & { body?: unknown },
): Promise<unknown> {
  const { body, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(endpoint.path, {
      method: endpoint.method,
      ...(endpoint.request === null
        ? {}
        : {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
      ...rest,
    });
  } catch (cause) {
    return networkFailure(cause);
  }

  try {
    return await decodeEndpointResponse(endpoint, response);
  } catch (cause) {
    return networkFailure(cause);
  }
}

function declaredOutcome(response: Response, body: unknown) {
  return response.ok
    ? { ok: true, status: response.status, data: body }
    : { ok: false, kind: 'api' as const, status: response.status, error: body };
}

async function decodeEndpointResponse(
  endpoint: EndpointContract,
  response: Response,
): Promise<unknown> {
  const codec = endpoint.responses[response.status];
  if (codec === undefined) {
    return protocolFailure(response.status, 'Endpoint returned an undeclared status');
  }

  if (codec.kind === 'empty') {
    return decodeEmptyResponse(response);
  }

  if (codec.kind === 'text') {
    return declaredOutcome(response, await response.text());
  }

  const decoded = await readJson(response);
  if (!decoded.ok) {
    if (decoded.kind === 'network') return networkFailure(decoded.cause);
    return protocolFailure(response.status, 'Endpoint returned invalid JSON');
  }

  if (codec.kind === 'json') {
    return decodeJsonResponse(response, decoded.data, codec.schema);
  }

  return decodeProblemResponse(response, decoded.data, codec.codes);
}

async function decodeEmptyResponse(response: Response): Promise<unknown> {
  const wireBody = await response.text();
  if (wireBody.length > 0) {
    return protocolFailure(response.status, 'Endpoint returned a body for an empty response');
  }
  return declaredOutcome(response, undefined);
}

function decodeJsonResponse(
  response: Response,
  data: unknown,
  schema: z.ZodType<unknown, unknown>,
): unknown {
  if (!schema.safeParse(data).success) {
    return protocolFailure(response.status, 'Endpoint response failed its schema');
  }
  return declaredOutcome(response, data);
}

function decodeProblemResponse(
  response: Response,
  data: unknown,
  codes: readonly string[],
): unknown {
  const parsed = problemBodySchema.safeParse(data);
  if (!parsed.success || parsed.data.status !== response.status) {
    return protocolFailure(response.status, 'Endpoint returned an invalid problem body');
  }
  if (codes.length > 0 && !codes.includes(parsed.data.code)) {
    return protocolFailure(response.status, 'Endpoint returned an undeclared problem code');
  }
  return declaredOutcome(response, data);
}
