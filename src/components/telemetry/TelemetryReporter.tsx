'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { postTelemetry } from './client';

// Paths the tracker silently ignores. Admin surfaces are excluded so the
// developer's own dashboard inspection doesn't pollute the metrics they
// are reading.
const SKIP_PREFIXES = ['/admin', '/api/'];

const VISITOR_KEY = 'lgi:visitor_id';
const SESSION_FLAG_KEY = 'lgi:session_started';

function shouldSkip(path: string): boolean {
  return SKIP_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
}

// Reads document.referrer and returns only the hostname when it points at
// a different origin than the current page. Same-origin referrers are
// dropped (they're page-hops, not acquisition events). Errors are
// swallowed — a malformed referrer must never break the page.
function readReferrerHost(): string | null {
  try {
    const raw = typeof document !== 'undefined' ? document.referrer : '';
    if (!raw) return null;
    const url = new URL(raw);
    if (typeof window !== 'undefined' && url.host === window.location.host) return null;
    return url.host || null;
  } catch {
    return null;
  }
}

interface UtmTags {
  source?: string;
  medium?: string;
  campaign?: string;
}

function readUtmTags(params: URLSearchParams): UtmTags | undefined {
  const source = params.get('utm_source');
  const medium = params.get('utm_medium');
  const campaign = params.get('utm_campaign');
  const tags: UtmTags = {};
  if (source) tags.source = source;
  if (medium) tags.medium = medium;
  if (campaign) tags.campaign = campaign;
  return Object.keys(tags).length > 0 ? tags : undefined;
}

// Random per-browser UUID kept in localStorage. Lets the admin dashboard
// distinguish a first-time lander from a returning page-hopper without
// any fingerprinting. localStorage access is wrapped in try/catch so
// private-browsing and SSR-prerender contexts can't throw.
function getOrCreateVisitorId(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    const existing = window.localStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    window.localStorage.setItem(VISITOR_KEY, fresh);
    return fresh;
  } catch {
    return null;
  }
}

// Returns true only on the very first page-view of the current tab
// session. Subsequent events return false so the admin's Entry Pages
// panel reports landing pages, not navigation targets within a session.
function takeIsEntry(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const flagged = window.sessionStorage.getItem(SESSION_FLAG_KEY);
    if (flagged) return false;
    window.sessionStorage.setItem(SESSION_FLAG_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

// Mounted once at the root layout. Watches the URL via Next.js navigation
// hooks and POSTs a page_view event for every change. Failures are
// swallowed by the server route — nothing to surface to the user either
// way.
export function TelemetryReporter(): null {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    if (!pathname || shouldSkip(pathname)) return;
    const metadata: Record<string, unknown> = { path: pathname, search };

    const referrer = readReferrerHost();
    if (referrer) metadata.referrer = referrer;

    const utm = readUtmTags(searchParams);
    if (utm) metadata.utm = utm;

    const visitorId = getOrCreateVisitorId();
    if (visitorId) metadata.visitor_id = visitorId;

    metadata.is_entry = takeIsEntry();

    postTelemetry({ action: 'page_view', metadata });
  }, [pathname, search, searchParams]);

  return null;
}
