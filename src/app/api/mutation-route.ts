import { runCapabilityRoute } from '@/app/api/capability-route';
import type { CapabilityId } from '@/data/telemetry/capability';
import type { AppFailure } from '@/lib/failure';
import { problemResponse } from '@/transport/api-response';
import { requireSameOrigin } from '@/platform/auth/same-origin';

export type AuthorizationSuccess = { ok: true };
export type FailureResult = { ok: false; failure: AppFailure };
export type MaybePromise<T> = T | Promise<T>;
type AuthorizationFunction = () => Promise<AuthorizationSuccess | FailureResult>;
type ParseFunction = (
  request: Request,
) => Promise<{ ok: true; data: unknown } | FailureResult>;
export type AuthorizationResult<T extends AuthorizationSuccess> = T | FailureResult;

export interface CapabilityOption {
  capability: CapabilityId;
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

async function runStages(
  request: Request,
  runtime: RuntimeMutationOptions,
): Promise<Response> {
  if (runtime.preflight) {
    const shortCircuit = await runtime.preflight();
    if (shortCircuit) return shortCircuit;
  }

  const authorization = await runtime.authorize();
  if (!authorization.ok) return problemResponse(authorization.failure);

  const originCheck = requireSameOrigin(request);
  if (!originCheck.ok) return problemResponse(originCheck.failure);

  if (runtime.parse) {
    const parsed = await runtime.parse(request);
    if (!parsed.ok) return problemResponse(parsed.failure);
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
