/**
 * The request init for an ESI call, built one way. It imports nothing: the
 * Convex isolate bundles platform/esi. Headers stay a plain object; dispatch
 * wraps them in `Headers`, and an Authorization header is what keeps a read
 * out of the shared ETag cache.
 */

function bearer(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

/** A token-authorized read: a held ETag goes out as If-None-Match, and the caller's signal when given. */
export function esiAuthInit(
  accessToken: string,
  opts: { etag?: string | null; signal?: AbortSignal } = {},
): RequestInit {
  const headers = bearer(accessToken);
  if (opts.etag !== undefined && opts.etag !== null) headers['If-None-Match'] = opts.etag;
  return { headers, ...(opts.signal ? { signal: opts.signal } : {}) };
}

/** A JSON POST of `body`, token-authorized when a token is given. */
export function esiJsonPostInit(body: unknown, accessToken?: string): RequestInit {
  return {
    method: 'POST',
    headers: {
      ...(accessToken === undefined ? {} : bearer(accessToken)),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}
