'use client';

import { apiFetch } from '@/transport/api-client';
import { systemStaticsEndpoint } from './api-contract';

const pendingStaticsBySystem = new Map<number, Promise<readonly string[]>>();

async function fetchSystemStatics(systemId: number): Promise<readonly string[]> {
  const result = await apiFetch(systemStaticsEndpoint, { params: { systemId } });
  if (!result.ok) {
    const reason = 'status' in result ? result.status : result.kind;
    throw new Error(`system statics ${reason}`);
  }
  return result.data.statics;
}

export function loadSystemStatics(systemId: number): Promise<readonly string[]> {
  const pending = pendingStaticsBySystem.get(systemId);
  if (pending !== undefined) return pending;
  const request = fetchSystemStatics(systemId).finally(() => {
    pendingStaticsBySystem.delete(systemId);
  });
  pendingStaticsBySystem.set(systemId, request);
  return request;
}
