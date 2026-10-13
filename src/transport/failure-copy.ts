import { formatCount } from '@/lib/format/number';
import { problemBodySchema, type ProblemBody } from '@/lib/problem';
import type { EndpointContract, OutcomeOf } from './endpoint';

/**
 * The failed outcomes apiFetch resolves for one endpoint. A caller that runs
 * several endpoints unions their FailedOutcomes: OutcomeOf over a union of
 * endpoints keeps only the statuses they share.
 */
export type FailedOutcome<TEndpoint extends EndpointContract> = Extract<
  OutcomeOf<TEndpoint>,
  { ok: false }
>;

/**
 * User copy for one call's failures. `codes` takes only the problem codes the
 * failures declare; the conditional distributes, so a union of several
 * endpoints' failures takes any of their codes.
 */
export interface FailureCopy<TFailure> {
  /** Shown for a protocol failure and for any code the table and the shared defaults leave out. */
  readonly fallback: string;
  readonly codes?: {
    readonly [TCode in TFailure extends { kind: 'api'; error: { code: infer C extends string } }
      ? C
      : never]?: string;
  };
  /** Shown when no answer came back; by default the fallback asks the reader to check their connection. */
  readonly network?: string;
}

const SESSION_ENDED = 'Your session has ended. Sign in again.';
const CONNECTION_HINT = 'Check your connection and try again.';

/** The problem body of an api failure; null for a network or protocol failure, or a body that is not a problem. */
function problemOf(failure: FailedOutcome<EndpointContract>): ProblemBody | null {
  if (failure.kind !== 'api') return null;
  const parsed = problemBodySchema.safeParse(failure.error);
  return parsed.success ? parsed.data : null;
}

/**
 * The declared problem code a failure carries, or its kind when it carries
 * none. An api failure whose body is not a problem has no code to key on, so
 * it reads as `protocol` too.
 */
export function failureCode<TFailure extends FailedOutcome<EndpointContract>>(
  failure: TFailure,
): keyof NonNullable<FailureCopy<TFailure>['codes']> | 'network' | 'protocol' {
  if (failure.kind === 'network') return 'network';
  const code = problemOf(failure)?.code;
  // decode admits only an endpoint's declared codes, so a problem's code is a key of its table.
  return code === undefined ? 'protocol' : (code as keyof NonNullable<FailureCopy<TFailure>['codes']>);
}

/** Joins a lead phrase and a sentence, ending the lead first when it is a bare phrase such as a toast title. */
function sentences(lead: string, next: string): string {
  return /[.!?]$/.test(lead) ? `${lead} ${next}` : `${lead}. ${next}`;
}

/** Copy every caller shares unless its table names the code: an ended session and a rate limit. */
function sharedCopy(problem: ProblemBody): string | undefined {
  if (problem.code === 'unauthenticated') return SESSION_ENDED;
  if (problem.code !== 'rate_limited') return undefined;
  const wait =
    problem.retryAfterSeconds === undefined
      ? 'a moment'
      : formatCount(problem.retryAfterSeconds, 'second');
  return `Too many attempts. Try again in ${wait}.`;
}

/**
 * The user copy for a failed call. A network failure takes `copy.network`, or
 * the fallback with a connection hint. A declared problem code takes its own
 * entry in `copy.codes`, then the shared copy for an ended session or a rate
 * limit (with the server's retry delay). Anything else, a protocol failure
 * included, takes the fallback.
 */
export function failureMessage<TFailure extends FailedOutcome<EndpointContract>>(
  failure: TFailure,
  copy: FailureCopy<TFailure>,
): string {
  if (failure.kind === 'network') return copy.network ?? sentences(copy.fallback, CONNECTION_HINT);
  const problem = problemOf(failure);
  if (problem === null) return copy.fallback;
  const codes: Readonly<Record<string, string | undefined>> = copy.codes ?? {};
  const own = Object.hasOwn(codes, problem.code) ? codes[problem.code] : undefined;
  return own ?? sharedCopy(problem) ?? copy.fallback;
}
