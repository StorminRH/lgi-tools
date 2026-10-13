import { isSafeServiceUrl } from '@/lib/url-safety';

/**
 * The Next app origin Convex calls back into, with the service secret on
 * some calls. Undefined when SITE_URL is unset, empty, unparsable, or neither
 * HTTPS nor loopback HTTP. This is the one sanctioned raw read of SITE_URL: it
 * is a Convex-only variable, so it stays out of the Next env registry.
 */
export function readAppOrigin(): string | undefined {
  const raw = process.env.SITE_URL;
  if (raw === undefined || !isSafeServiceUrl(raw)) return undefined;
  return new URL(raw).origin;
}
