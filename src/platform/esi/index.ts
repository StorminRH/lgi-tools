import { addDependencyTiming } from '@/lib/dependency-timing';
import {
  consultPreDispatch,
  dispatch,
  enforceBudget,
  getScoreboard,
  isEtagEligible,
  serveFromExpiresWindow,
  type EsiFetchOptions,
} from './dispatch';

export {
  EsiBudgetExhaustedError,
  EsiServerError,
  EsiContractError,
  ESI_BUDGET_FLOOR,
} from './errors';

export { __resetEsiGateForTests, __setScoreboardForTests } from './dispatch';
export type { EsiFetchOptions } from './dispatch';

const ESI_BASE_URL = 'https://esi.evetech.net';

export function esiUrl(path: string): string {
  return `${ESI_BASE_URL}${path}`;
}

export async function esiFetch(
  url: string,
  init?: RequestInit,
  opts?: EsiFetchOptions,
): Promise<Response> {
  const sb = getScoreboard();
  const wantEtag = isEtagEligible(init);

  const pre = await consultPreDispatch(sb, url, wantEtag);
  enforceBudget(pre, url, opts);

  const liveSb = pre !== null ? sb : null;
  const etagMeta = pre !== null && wantEtag ? pre.etag : null;

  if (etagMeta !== null && liveSb !== null) {
    const cached = await serveFromExpiresWindow(url, etagMeta, liveSb);
    if (cached !== null) return cached;
  }

  const startedAt = Date.now();
  try {
    return await dispatch(url, init, wantEtag, liveSb, etagMeta);
  } finally {
    addDependencyTiming('esi', Date.now() - startedAt);
  }
}
