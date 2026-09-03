import type { z } from 'zod';
import { problemBodySchema } from '@/lib/problem';
import type { EndpointContract, OutcomeOf } from './endpoint';

function protocolFailure(status: number, detail: string) {
  return { ok: false, kind: 'protocol' as const, status, detail };
}

const ABORTED_ERROR_NAMES: ReadonlySet<string> = new Set(['AbortError', 'TimeoutError']);

function isAbortError(cause: unknown): boolean {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'name' in cause &&
    typeof cause.name === 'string' &&
    ABORTED_ERROR_NAMES.has(cause.name)
  );
}

export function networkFailure(cause: unknown): {
  ok: false;
  kind: 'network';
  aborted: boolean;
  cause: unknown;
} {
  return {
    ok: false,
    kind: 'network',
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

function declaredOutcome(response: Response, body: unknown) {
  return response.ok
    ? { ok: true, status: response.status, data: body }
    : { ok: false, kind: 'api' as const, status: response.status, error: body };
}

export async function decodeEndpointResponse<TEndpoint extends EndpointContract>(
  endpoint: TEndpoint,
  response: Response,
): Promise<OutcomeOf<TEndpoint>>;

export async function decodeEndpointResponse(
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
