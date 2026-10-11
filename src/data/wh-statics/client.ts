'use client';

import { singleFlight } from '@/lib/memoize';
import { apiFetch } from '@/transport/api-client';
import { systemStaticsEndpoint } from './api-contract';

async function fetchSystemStatics(systemId: number): Promise<readonly string[]> {
  const result = await apiFetch(systemStaticsEndpoint, { params: { systemId } });
  if (!result.ok) {
    const reason = 'status' in result ? result.status : result.kind;
    throw new Error(`system statics ${reason}`);
  }
  return result.data.statics;
}

/** Concurrent reads of one system share a request; a settled read is not cached. */
export const loadSystemStatics = singleFlight(fetchSystemStatics);
