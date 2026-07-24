import type { AppFailure } from '@/lib/failure';
import { problemResponse } from '@/lib/problem';
import { requireSameOrigin } from '@/platform/auth/same-origin';

type AuthorizationSuccess = { ok: true };
type FailureResult = { ok: false; failure: AppFailure };
type MaybePromise<T> = T | Promise<T>;
type AuthorizationFunction = () => Promise<AuthorizationSuccess | FailureResult>;
type ParseFunction = (
  request: Request,
) => Promise<{ ok: true; data: unknown } | FailureResult>;
type AuthorizationResult<T extends AuthorizationSuccess> = T | FailureResult;

interface BodylessMutationOptions<TAuthorization extends AuthorizationSuccess> {
  authorize: () => Promise<AuthorizationResult<TAuthorization>>;
  handle: (authorization: TAuthorization) => MaybePromise<Response>;
}

interface BodyfulMutationOptions<TAuthorization extends AuthorizationSuccess, TBody> {
  authorize: () => Promise<AuthorizationResult<TAuthorization>>;
  parse: (
    request: Request,
  ) => Promise<{ ok: true; data: TBody } | FailureResult>;
  handle: (authorization: TAuthorization, body: TBody) => MaybePromise<Response>;
}

interface RuntimeMutationOptions {
  authorize: AuthorizationFunction;
  parse?: ParseFunction;
  handle: (authorization: AuthorizationSuccess, body?: unknown) => MaybePromise<Response>;
}

/**
 * Runs authorize, same-origin observation, optional parsing, then the handler.
 * Guard and parser failures map through the problem owner; unexpected errors propagate.
 * Caller-owned rate limits run before this boundary.
 */
export function runMutationRoute<TAuthorization extends AuthorizationSuccess, TBody>(
  request: Request,
  options: BodyfulMutationOptions<TAuthorization, TBody>,
): Promise<Response>;
/**
 * Runs authorization, same-origin observation, optional body parsing, and the mutation handler in
 * order; guard and parser failures map through the problem owner.
 */
export function runMutationRoute<TAuthorization extends AuthorizationSuccess>(
  request: Request,
  options: BodylessMutationOptions<TAuthorization>,
): Promise<Response>;
export async function runMutationRoute(request: Request, options: unknown): Promise<Response> {
  // The public signature couples each handler to its own guard and parser; this
  // runtime view only erases those generics after the caller has been checked.
  const runtime = options as RuntimeMutationOptions;
  const authorization = await runtime.authorize();
  if (!authorization.ok) return problemResponse(authorization.failure);

  requireSameOrigin(request);

  if (runtime.parse) {
    const parsed = await runtime.parse(request);
    if (!parsed.ok) return problemResponse(parsed.failure);
    return runtime.handle(authorization, parsed.data);
  }

  return runtime.handle(authorization);
}
