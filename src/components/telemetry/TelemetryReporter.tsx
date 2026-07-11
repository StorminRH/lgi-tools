'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { postTelemetry } from './client';
import {
  buildPageViewMetadata,
  readUtmTags,
  referrerHostFrom,
  shouldSkip,
} from './page-view-metadata';

const VISITOR_KEY = 'lgi:visitor_id';
const SESSION_FLAG_KEY = 'lgi:session_started';

// Reads document.referrer and returns only the hostname when it points at a
// different origin than the current page (the parse + same-origin check live in
// {@link referrerHostFrom}). Errors are swallowed — a malformed referrer must
// never break the page.
function readReferrerHost(): string | null {
  try {
    const raw = typeof document !== 'undefined' ? document.referrer : '';
    const currentHost = typeof window !== 'undefined' ? window.location.host : '';
    return referrerHostFrom(raw, currentHost);
  } catch {
    return null;
  }
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
    const metadata = buildPageViewMetadata({
      path: pathname,
      search,
      referrer: readReferrerHost(),
      utm: readUtmTags(searchParams),
      visitorId: getOrCreateVisitorId(),
      isEntry: takeIsEntry(),
    });
    postTelemetry({ action: 'page_view', metadata });
  }, [pathname, search, searchParams]);

  return null;
}
