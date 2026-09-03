const SKIP_PREFIXES = ['/admin', '/api/'];

export function shouldSkip(path: string): boolean {
  return SKIP_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
}

export interface UtmTags {
  source?: string;
  medium?: string;
  campaign?: string;
}

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

export function referrerHostFrom(raw: string, currentHost: string): string | null {
  if (!raw) return null;
  const url = new URL(raw);
  if (url.host === currentHost) return null;
  return url.host || null;
}

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
