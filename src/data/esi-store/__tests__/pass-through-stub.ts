import type { EsiRoute } from '@/lib/esi-datasets/routes';
import { resolvePath } from '../key';
import type { EsiParams } from '../types';

export type Transport = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * The store reduced to its pass-through transport for unit tests: every
 * `esiPassThrough` call goes straight to `transport` at the route's
 * resolved path under `origin`, with no declaration check and no downtime
 * halt.
 */
export function passThroughStub(transport: Transport, origin = 'https://esi.test') {
  return {
    esiPassThrough: (route: EsiRoute, params: EsiParams | undefined, init?: RequestInit) =>
      transport(`${origin}${resolvePath({ route, holder: { kind: 'global' }, params })}`, init),
  };
}
