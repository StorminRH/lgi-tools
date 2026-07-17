// Pure, testable pieces of the page-view telemetry event. The browser-coupled
// reads (referrer, localStorage visitor id, session-entry flag) stay in the
// reporter component; everything here is a plain function over its inputs.

// Paths the tracker silently ignores. Admin surfaces are excluded so the
// developer's own dashboard inspection doesn't pollute the metrics they read.
const SKIP_PREFIXES = ['/admin', '/api/'];

/**
 * Returns whether a pathname is excluded from public page-view telemetry, including admin and API
 * surfaces.
 */
export function shouldSkip(path: string): boolean {
  return SKIP_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
}

/** Privacy-bounded UTM fields retained for page-view attribution; absent query parameters remain undefined. */
export interface UtmTags {
  source?: string;
  medium?: string;
  campaign?: string;
}

/** Extracts the supported UTM parameters from a URL query, returning undefined when none are present. */
export function readUtmTags(params: URLSearchParams): UtmTags | undefined {
  const source = params.get('utm_source');
  const medium = params.get('utm_medium');
  const campaign = params.get('utm_campaign');
  const tags: UtmTags = {};
  if (source) tags.source = source;
  if (medium) tags.medium = medium;
  if (campaign) tags.campaign = campaign;
  return Object.keys(tags).length > 0 ? tags : undefined;
}

/**
 * The referrer hostname, but only when it points at a different origin than the
 * current page — same-origin referrers are page-hops, not acquisition events.
 * `raw` is the document.referrer; a malformed URL throws (the caller swallows it).
 */
export function referrerHostFrom(raw: string, currentHost: string): string | null {
  if (!raw) return null;
  const url = new URL(raw);
  if (url.host === currentHost) return null;
  return url.host || null;
}

/**
 * Builds the privacy-safe page-view metadata payload from URL, referrer, UTM, and client hints;
 * raw query values are not retained.
 */
export function buildPageViewMetadata(input: {
  path: string;
  search: string;
  referrer: string | null;
  utm: UtmTags | undefined;
  visitorId: string | null;
  isEntry: boolean;
}): Record<string, unknown> {
  const metadata: Record<string, unknown> = { path: input.path, search: input.search };
  if (input.referrer) metadata.referrer = input.referrer;
  if (input.utm) metadata.utm = input.utm;
  if (input.visitorId) metadata.visitor_id = input.visitorId;
  metadata.is_entry = input.isEntry;
  return metadata;
}
