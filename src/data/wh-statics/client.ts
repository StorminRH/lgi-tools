'use client';

import { singleFlight } from '@/lib/memoize';
import { apiFetchData } from '@/transport/api-fetch-data';
import { systemStaticsEndpoint } from './api-contract';

async function fetchSystemStatics(systemId: number): Promise<readonly string[]> {
  return (await apiFetchData(systemStaticsEndpoint, 'system statics', { params: { systemId } })).statics;
}

/** Concurrent reads of one system share a request; a settled read is not cached. */
export const loadSystemStatics = singleFlight(fetchSystemStatics);
