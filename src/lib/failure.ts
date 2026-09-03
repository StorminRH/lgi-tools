export const FAILURE_CATEGORIES = [
  'validation',
  'unauthenticated',
  'forbidden',
  'not_found',
  'conflict',
  'rate_limited',
  'dependency_unavailable',
  'unexpected',
] as const;

export type FailureCategory = (typeof FAILURE_CATEGORIES)[number];

export interface AppFailure {
  category: FailureCategory;
  code: string;
  detail?: string;
  retryAfterSeconds?: number;
  status?: 502 | 503;
  cause?: unknown;
}

function failure(
  category: FailureCategory,
  code: string,
  options: Omit<AppFailure, 'category' | 'code'> = {},
): AppFailure {
  return { category, code, ...options };
}

export function validationFailure(
  code = 'validation',
  detail?: string,
): AppFailure {
  return failure('validation', code, { detail });
}

export function unauthenticatedFailure(
  code = 'unauthenticated',
  detail?: string,
): AppFailure {
  return failure('unauthenticated', code, { detail });
}

export function forbiddenFailure(code = 'forbidden', detail?: string): AppFailure {
  return failure('forbidden', code, { detail });
}

export function notFoundFailure(code = 'not_found', detail?: string): AppFailure {
  return failure('not_found', code, { detail });
}

export function conflictFailure(code = 'conflict', detail?: string): AppFailure {
  return failure('conflict', code, { detail });
}

export function rateLimitedFailure(
  retryAfterSeconds: number,
  code = 'rate_limited',
  detail?: string,
): AppFailure & {
  category: 'rate_limited';
  retryAfterSeconds: number;
} {
  return {
    category: 'rate_limited',
    code,
    detail,
    retryAfterSeconds,
  };
}

export function dependencyUnavailableFailure(
  code = 'dependency_unavailable',
  status: 502 | 503 = 503,
  options: { cause?: unknown; detail?: string } = {},
): AppFailure {
  return failure('dependency_unavailable', code, { status, ...options });
}

export function unexpectedFailure(
  code = 'unexpected',
  cause?: unknown,
  detail?: string,
): AppFailure {
  return failure('unexpected', code, { cause, detail });
}

function isFailureCategory(value: string): value is FailureCategory {
  return FAILURE_CATEGORIES.some((category) => category === value);
}

export function isAppFailure(value: unknown): value is AppFailure {
  if (typeof value !== 'object' || value === null) return false;
  if (!('category' in value) || !('code' in value)) return false;
  return (
    typeof value.category === 'string' &&
    isFailureCategory(value.category) &&
    typeof value.code === 'string'
  );
}
