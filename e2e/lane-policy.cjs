/* eslint-disable @typescript-eslint/no-require-imports -- Playwright CJS specs cannot statically import .mjs; this helper stays native CommonJS. */
const { isLocalBaseUrl } = require('../scripts/run-e2e-guard.cjs');

const lanes = ['mandatory-production', 'local-mutation', 'deployed-readonly', 'dev-only', 'benchmark'];

/** @param {{env?: Record<string, string | undefined>, argv?: string[]}} options */
function resolveLane({ env = process.env, argv = [] } = {}) {
  const lane = env.E2E_LANE ?? 'mandatory-production';
  if (!lanes.includes(lane)) throw new Error(`BLOCKED prerequisite: unknown E2E_LANE ${lane}`);
  const baseURL = env.PLAYWRIGHT_BASE_URL ?? env.UX_BASE_URL ?? 'http://localhost:3000';
  const local = isLocalBaseUrl(baseURL);
  if ((lane === 'deployed-readonly') === local) {
    throw new Error('BLOCKED prerequisite: remote targets require deployed-readonly; other lanes require localhost');
  }
  const listing = argv.includes('--list');
  if (!listing && !['mandatory-production', 'deployed-readonly'].includes(lane) && !env.E2E_SCENARIOS?.trim()) {
    throw new Error('BLOCKED prerequisite: select E2E_SCENARIOS; the portfolio never runs by default');
  }
  if (argv.some((arg) => arg === '--no-deps' || arg === '--pass-with-no-tests')) {
    throw new Error('BLOCKED prerequisite: acceptance cannot bypass dependencies or allow an empty selection');
  }
  return { lane, baseURL, local, listing };
}

function selectJourneys({ journeys, lane, scenarioIds, list = false }) {
  const selection = new Set(scenarioIds);
  for (const id of selection) {
    const journey = journeys.find((item) => item.id === id);
    if (!journey) throw new Error(`BLOCKED prerequisite: unknown journey ${id}`);
    if (journey.lane !== lane) throw new Error(`BLOCKED prerequisite: ${id} requires lane ${journey.lane}`);
  }
  return journeys.filter((journey) => journey.lane === lane &&
    (selection.has(journey.id) || (list && selection.size === 0)));
}

module.exports = { lanes, resolveLane, selectJourneys };
