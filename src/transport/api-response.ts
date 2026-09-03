import { isAppFailure, type AppFailure } from '@/lib/failure';
import { problemBody, serializeProblem } from '@/lib/problem';
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

/** Builds one endpoint-declared response with the exact body required by its status codec. */
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
 * Maps one typed failure to its safe delivery-boundary problem response, reusing the operation's
 * ambient correlation id so the id the user is shown is the id recorded against the operation.
 */
export function problemResponse(failure: AppFailure): Response {
  stashFailure(failure);
  return serializeProblem(problemBody(failure, currentCorrelationId()));
}

/** Stamps one Cache-Control value on an apiResponse-built response. */
export function withCacheControl(response: Response, value: string): Response {
  response.headers.set('Cache-Control', value);
  return response;
}
