import {
  consultPreDispatch,
  dispatch,
  enforceBudget,
  getScoreboard,
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

/**
 * The gate is transport, budget and headers. It stores nothing: a caller's
 * If-None-Match goes out as given, and ESI's 304 comes back as it is.
 */
export async function esiFetch(
  url: string,
  init?: RequestInit,
  opts?: EsiFetchOptions,
): Promise<Response> {
  const sb = getScoreboard();
  const pre = await consultPreDispatch(sb, url);
  enforceBudget(pre, url, opts);
  return dispatch(url, init, pre !== null ? sb : null);
}
