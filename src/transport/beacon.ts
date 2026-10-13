import type { z } from 'zod';
import { apiFetch } from './api-client';
import type { EndpointContract, RequestInputOf, RequiresUrlInput } from './endpoint';

/**
 * Posts a JSON body that has to outlive the page. It tries
 * `navigator.sendBeacon` first. When there is no beacon, or the browser
 * refuses to queue one, it falls back to a keepalive `apiFetch`. Nothing
 * reads the outcome, and `apiFetch` never rejects.
 *
 * The beacon posts to `endpoint.path` verbatim, so only POST endpoints with
 * no path params and no query schema are accepted.
 */
export function postBeacon<
  const E extends EndpointContract<z.ZodTypeAny> & { method: 'POST'; query?: undefined },
>(endpoint: E & (RequiresUrlInput<E> extends true ? never : unknown), body: RequestInputOf<E>): void {
  if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
    const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
    if (navigator.sendBeacon(endpoint.path, blob)) return;
  }
  void apiFetch<EndpointContract<z.ZodTypeAny>>(endpoint, { body, keepalive: true });
}
