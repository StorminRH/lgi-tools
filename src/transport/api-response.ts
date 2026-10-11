import { isAppFailure, type AppFailure } from '@/lib/failure';
import { problemBody, problemStatus, serializeProblem } from '@/lib/problem';
import { currentCorrelationId, stashFailure } from './correlation';
import type {
  DeclaredStatus,
  EmptyCodec,
  EndpointContract,
  JsonCodec,
  ProblemCodec,
  ResponseCodec,
  TextCodec,
} from './endpoint';

export type ResponseArgsFor<TCodec extends ResponseCodec> =
  TCodec extends ProblemCodec
    ? [failure: AppFailure]
    : TCodec extends JsonCodec<infer TBody>
      ? [body: TBody]
      : TCodec extends TextCodec
        ? [body: string]
        : TCodec extends EmptyCodec
          ? []
          : never;

export function apiResponse<
  TEndpoint extends EndpointContract,
  TStatus extends DeclaredStatus<TEndpoint>,
>(
  endpoint: TEndpoint,
  status: TStatus,
  ...body: ResponseArgsFor<TEndpoint['responses'][TStatus]>
): Response;
export function apiResponse(
  endpoint: EndpointContract,
  status: number,
  ...body: unknown[]
): Response {
  const codec = endpoint.responses[status];
  if (codec === undefined) {
    throw new Error(`Endpoint ${endpoint.method} ${endpoint.path} does not declare status ${status}`);
  }

  if (codec.kind === 'empty') {
    if (body.length !== 0) throw new Error(`Status ${status} does not accept a response body`);
    return new Response(null, { status });
  }

  const value = body[0];
  if (body.length !== 1) throw new Error(`Status ${status} requires one response body`);

  if (codec.kind === 'text') {
    if (typeof value !== 'string') throw new Error(`Status ${status} requires a text body`);
    return new Response(value, { status });
  }

  if (codec.kind === 'json') {
    return Response.json(value, { status });
  }

  return declaredProblem(codec, status, value);
}

function declaredProblem(codec: ProblemCodec, status: number, value: unknown): Response {
  if (!isAppFailure(value)) throw new Error(`Status ${status} requires an application failure`);
  if (codec.codes.length > 0 && !codec.codes.includes(value.code)) {
    throw new Error(`Status ${status} does not declare problem code ${value.code}`);
  }
  const mapped = problemBody(value, currentCorrelationId());
  if (mapped.status !== status) {
    throw new Error(
      `Failure ${value.category} maps to ${mapped.status}, not declared status ${status}`,
    );
  }
  stashFailure(value);
  return serializeProblem(mapped);
}

/**
 * Serializes a failure whose category is not known statically, such as a
 * shared pipeline stage's. The status comes from the failure, and the endpoint
 * must declare a problem there that admits the failure's code.
 */
export function apiFailure(endpoint: EndpointContract, failure: AppFailure): Response {
  const status = problemStatus(failure);
  const codec = endpoint.responses[status];
  if (codec?.kind !== 'problem') {
    throw new Error(
      `Endpoint ${endpoint.method} ${endpoint.path} does not declare a problem at status ${status}`,
    );
  }
  return declaredProblem(codec, status, failure);
}

export function problemResponse(failure: AppFailure): Response {
  stashFailure(failure);
  return serializeProblem(problemBody(failure, currentCorrelationId()));
}

/**
 * The Post/Redirect/Get 303 a browser form post answers with. `path` resolves
 * against the request, undefined query values are left out, and a failure
 * reported through the redirect is stashed so capability telemetry records it.
 */
export function seeOther(
  request: Request,
  path: string,
  options: {
    query?: Readonly<Record<string, string | undefined>>;
    failure?: AppFailure;
  } = {},
): Response {
  const url = new URL(path, request.url);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  if (options.failure) stashFailure(options.failure);
  return Response.redirect(url, 303);
}

export function withCacheControl(response: Response, value: string): Response {
  response.headers.set('Cache-Control', value);
  return response;
}
