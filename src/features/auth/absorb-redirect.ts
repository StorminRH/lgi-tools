/**
 * Decorates Better Auth's OAuth-callback redirect with the absorbed-character
 * marker so the roster can show its moved-note (ACCOUNT.3 absorb-on-proof).
 * Only a clean redirect is decorated: the absorb can commit and the callback
 * still fail afterwards, and an error redirect must never claim a move
 * succeeded. The Location being decorated is Better Auth's own callbackURL,
 * validated against trustedOrigins when the link started — this only appends a
 * param. Pure over (response, requestUrl, absorbedCharacterId); the async
 * tracking scope lives in absorb-context.ts.
 */
export function decorateAbsorbRedirect(
  response: Response,
  requestUrl: string,
  absorbedCharacterId: number | null,
): Response {
  if (absorbedCharacterId === null) return response;
  if (response.status < 300 || response.status >= 400) return response;
  const location = response.headers.get('location');
  if (!location) return response;
  const target = new URL(location, requestUrl); // Location may be relative
  if (target.searchParams.has('error')) return response;
  target.searchParams.set('absorbed', String(absorbedCharacterId));
  const headers = new Headers(response.headers);
  headers.set('location', target.toString());
  return new Response(response.body, { status: response.status, headers });
}
