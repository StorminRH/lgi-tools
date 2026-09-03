'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { postTelemetry } from '@/components/composition/telemetry/client';
import {
  buildPageViewMetadata,
  readUtmTags,
  referrerHostFrom,
  shouldSkip,
} from '@/components/telemetry/page-view-metadata';

const VISITOR_KEY = 'lgi:visitor_id';
const SESSION_FLAG_KEY = 'lgi:session_started';

function readReferrerHost(): string | null {
  try {
    const raw = typeof document !== 'undefined' ? document.referrer : '';
    const currentHost = typeof window !== 'undefined' ? window.location.host : '';
    return referrerHostFrom(raw, currentHost);
  } catch {
    return null;
  }
}

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
