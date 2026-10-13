import type { EsiRoute } from '@/lib/esi-datasets/routes';
import type { EsiFetchOptions } from '@/platform/esi';
import { resolvePath } from '../key';
import type { EsiParams } from '../types';

export type Transport = (url: string, init?: RequestInit, opts?: EsiFetchOptions) => Promise<Response>;

/**
 * The store reduced to its pass-through transport for unit tests: every
 * `esiPassThrough` call goes straight to `transport` at the route's
 * resolved path under `origin`, with no declaration check and no downtime
 * halt.
 */
export function passThroughStub(transport: Transport, origin = 'https://esi.test') {
  return {
    esiPassThrough: (route: EsiRoute, params: EsiParams | undefined, init?: RequestInit, opts?: EsiFetchOptions) =>
      transport(`${origin}${resolvePath({ route, holder: { kind: 'global' }, params })}`, init, opts),
  };
}
