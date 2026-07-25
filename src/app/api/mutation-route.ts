import { runCapabilityRoute } from '@/app/api/capability-route';
import type { CapabilityId } from '@/data/telemetry/capability';
import type { AppFailure } from '@/lib/failure';
import { problemResponse } from '@/transport/api-response';
import { requireSameOrigin } from '@/platform/auth/same-origin';

/**
 * Mutation gate contract
 *
 * The intended order is cheap rejection → caller-owned rate limit → identity → same-origin →
 * parse → object authorization → transaction → telemetry. It protects cookie-authenticated
 * mutations from CSRF: Better Auth's SameSite=Lax cookie is the browser-side first line, and the
 * enforced Origin/Referer mismatch check is the server-side line. Seven guarded form routes accept
 * form encodings, so their defense rests on those two lines rather than content type.
 *
 * This shared pipeline owns identity → same-origin → parse → handler; callers retain rate limits
 * before the boundary, and handlers own object authorization, transactions, and telemetry. The five
 * direct routes keep their established positions: account deletion checks after rate limit and
 * identity; the three admin form routes check after identity; feedback checks after parse and rate
 * limit.
 *
 * Requests with neither Origin nor Referer remain allowed. The observer did not record that class,
 * so the decision rests on modern-browser Origin behavior and SameSite=Lax, not telemetry. A
 * Fetch-Metadata/content-type provenance policy is deferred until a trusted sibling subdomain, a
 * new cookie-authenticated mutation class, or observed missing-provenance abuse justifies it.
 */
type AuthorizationSuccess = { ok: true };
type FailureResult = { ok: false; failure: AppFailure };
type MaybePromise<T> = T | Promise<T>;
type AuthorizationFunction = () => Promise<AuthorizationSuccess | FailureResult>;
type ParseFunction = (
  request: Request,
) => Promise<{ ok: true; data: unknown } | FailureResult>;
type AuthorizationResult<T extends AuthorizationSuccess> = T | FailureResult;

/**
 * Every mutation names the capability it serves. Required rather than optional so a new mutation
 * route cannot ship unrecorded: omitting it is a compile error, not a silent gap.
 */
interface CapabilityOption {
  capability: CapabilityId;
}

interface BodylessMutationOptions<TAuthorization extends AuthorizationSuccess>
  extends CapabilityOption {
  authorize: () => Promise<AuthorizationResult<TAuthorization>>;
  handle: (authorization: TAuthorization) => MaybePromise<Response>;
}

interface BodyfulMutationOptions<TAuthorization extends AuthorizationSuccess, TBody>
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

// The stage ordering, extracted so the recording wrapper below adds no nesting.
async function runStages(
  request: Request,
  runtime: RuntimeMutationOptions,
): Promise<Response> {
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

/**
 * Runs authorize, same-origin enforcement, optional parsing, then the handler.
 * Guard and parser failures map through the problem owner; unexpected errors propagate.
 * Caller-owned rate limits run before this boundary.
 */
export function runMutationRoute<TAuthorization extends AuthorizationSuccess, TBody>(
  request: Request,
  options: BodyfulMutationOptions<TAuthorization, TBody>,
): Promise<Response>;
/**
 * Runs authorization, same-origin enforcement, optional body parsing, and the mutation handler in
 * order; guard and parser failures map through the problem owner.
 */
export function runMutationRoute<TAuthorization extends AuthorizationSuccess>(
  request: Request,
  options: BodylessMutationOptions<TAuthorization>,
): Promise<Response>;
export function runMutationRoute(request: Request, options: unknown): Promise<Response> {
  // The public signature couples each handler to its own guard and parser; this
  // runtime view only erases those generics after the caller has been checked.
  const runtime = options as RuntimeMutationOptions;
  return runCapabilityRoute(runtime.capability, () => runStages(request, runtime));
}
