import { requireSameOrigin } from '@/features/auth/same-origin';
import type { ParsedBody } from '@/lib/route-body';

type AuthorizationSuccess = { ok: true };
type AuthorizationFailure = { ok: false; response: Response };
type MaybePromise<T> = T | Promise<T>;
type AuthorizationFunction = () => Promise<AuthorizationSuccess | AuthorizationFailure>;
type ParseFunction = (request: Request) => Promise<ParsedBody<unknown>>;
type AuthorizationResult<T extends AuthorizationSuccess> = T | AuthorizationFailure;

interface BodylessMutationOptions<TAuthorization extends AuthorizationSuccess> {
  authorize: () => Promise<AuthorizationResult<TAuthorization>>;
  handle: (authorization: TAuthorization) => MaybePromise<Response>;
}

interface BodyfulMutationOptions<TAuthorization extends AuthorizationSuccess, TBody> {
  authorize: () => Promise<AuthorizationResult<TAuthorization>>;
  parse: (request: Request) => Promise<ParsedBody<TBody>>;
  handle: (authorization: TAuthorization, body: TBody) => MaybePromise<Response>;
}

interface RuntimeMutationOptions {
  authorize: AuthorizationFunction;
  parse?: ParseFunction;
  handle: (authorization: AuthorizationSuccess, body?: unknown) => MaybePromise<Response>;
}

/**
 * Runs authorize, same-origin observation, optional parsing, then the handler.
 * Guard and parser failures pass through unchanged; unexpected errors propagate.
 * Caller-owned rate limits run before this boundary.
 */
export function runMutationRoute<TAuthorization extends AuthorizationSuccess, TBody>(
  request: Request,
  options: BodyfulMutationOptions<TAuthorization, TBody>,
): Promise<Response>;
export function runMutationRoute<TAuthorization extends AuthorizationSuccess>(
  request: Request,
  options: BodylessMutationOptions<TAuthorization>,
): Promise<Response>;
export async function runMutationRoute(request: Request, options: unknown): Promise<Response> {
  // The public signature couples each handler to its own guard and parser; this
  // runtime view only erases those generics after the caller has been checked.
  const runtime = options as RuntimeMutationOptions;
  const authorization = await runtime.authorize();
  if (!authorization.ok) return authorization.response;

  requireSameOrigin(request);

  if (runtime.parse) {
    const parsed = await runtime.parse(request);
    if (!parsed.ok) return parsed.response;
    return runtime.handle(authorization, parsed.data);
  }

  return runtime.handle(authorization);
}
