import { runCapabilityRoute } from '@/app/api/capability-route';
import type { CapabilityId } from '@/data/telemetry/capability';
import type { AppFailure, FailureResult } from '@/lib/failure';
import { apiFailure, problemResponse } from '@/transport/api-response';
import type { EndpointContract } from '@/transport/endpoint';
import { requireSameOrigin } from '@/platform/auth/same-origin';

export type AuthorizationSuccess = { ok: true };
export type MaybePromise<T> = T | Promise<T>;
type AuthorizationFunction = () => Promise<AuthorizationSuccess | FailureResult>;
type ParseFunction = (
  request: Request,
) => Promise<{ ok: true; data: unknown } | FailureResult>;
export type AuthorizationResult<T extends AuthorizationSuccess> = T | FailureResult;

/** Authorizes every caller, for a public mutation that still needs the origin gate. */
export async function allowAnonymous(): Promise<AuthorizationSuccess> {
  return { ok: true };
}

export interface CapabilityOption {
  capability: CapabilityId;
  /** The route's contract; stage failures are then checked against its declared problems. */
  endpoint?: EndpointContract;
  preflight?: () => Promise<Response | null>;
}

export interface BodylessMutationOptions<TAuthorization extends AuthorizationSuccess>
  extends CapabilityOption {
  authorize: () => Promise<AuthorizationResult<TAuthorization>>;
  handle: (authorization: TAuthorization) => MaybePromise<Response>;
}

export interface BodyfulMutationOptions<TAuthorization extends AuthorizationSuccess, TBody>
  extends CapabilityOption {
  authorize: () => Promise<AuthorizationResult<TAuthorization>>;
  parse: (
    request: Request,
  ) => Promise<{ ok: true; data: TBody } | FailureResult>;
  handle: (authorization: TAuthorization, body: TBody) => MaybePromise<Response>;
}

interface RuntimeMutationOptions extends CapabilityOption {
  authorize: AuthorizationFunction;
  parse?: ParseFunction;
  handle: (authorization: AuthorizationSuccess, body?: unknown) => MaybePromise<Response>;
}

function stageFailure(endpoint: EndpointContract | undefined, failure: AppFailure): Response {
  return endpoint ? apiFailure(endpoint, failure) : problemResponse(failure);
}

async function runStages(
  request: Request,
  runtime: RuntimeMutationOptions,
): Promise<Response> {
  if (runtime.preflight) {
    const shortCircuit = await runtime.preflight();
    if (shortCircuit) return shortCircuit;
  }

  const authorization = await runtime.authorize();
  if (!authorization.ok) return stageFailure(runtime.endpoint, authorization.failure);

  const originCheck = requireSameOrigin(request);
  if (!originCheck.ok) return stageFailure(runtime.endpoint, originCheck.failure);

  if (runtime.parse) {
    const parsed = await runtime.parse(request);
    if (!parsed.ok) return stageFailure(runtime.endpoint, parsed.failure);
    return runtime.handle(authorization, parsed.data);
  }

  return runtime.handle(authorization);
}

export function runMutationRoute<TAuthorization extends AuthorizationSuccess, TBody>(
  request: Request,
  options: BodyfulMutationOptions<TAuthorization, TBody>,
): Promise<Response>;
export function runMutationRoute<TAuthorization extends AuthorizationSuccess>(
  request: Request,
  options: BodylessMutationOptions<TAuthorization>,
): Promise<Response>;
export function runMutationRoute(request: Request, options: unknown): Promise<Response> {
  const runtime = options as RuntimeMutationOptions;
  return runCapabilityRoute(runtime.capability, () => runStages(request, runtime));
}
