import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, test, vi } from 'vitest';
import type { IndustryProfileRow } from '../profiles/api-contract';
import { emptyProfileDocument } from '../profiles/profile-document';
import { MANUFACTURING_ACTIVITY, REACTION_ACTIVITY } from '../structure-bonus';
import type { BlueprintStructure } from '../types';
import type { BuildPlanValue, BuildSetupValue, PlannerConfigValue } from './planner-contexts';

const h = vi.hoisted(() => ({
  auth: { session: null as object | null, loading: false },
  setup: {} as Partial<BuildSetupValue>,
  favorites: null as { typeId: number; name: string }[] | null,
}));

vi.mock('@/platform/auth/components/AuthProvider', () => ({ useAuth: () => h.auth }));
vi.mock('@/platform/auth/link-character', () => ({ startEveSignIn: vi.fn() }));
vi.mock('../favorite-blueprints', () => ({ useFavoriteBlueprints: () => ({ favorites: h.favorites, toggle: vi.fn() }) }));
vi.mock('./CockpitKpis', () => ({ CockpitKpis: () => createElement('div', null, 'kpis') }));
vi.mock('./MultibuyPanel', () => ({ MultibuyPanel: () => createElement('button', null, 'Multibuy') }));
vi.mock('./planner-contexts', () => ({
  useBuildSetup: () => h.setup,
  useMarketData: () => ({ pricing: null, refreshing: false }),
  usePlannerConfig: (): Partial<PlannerConfigValue> => ({ runs: 3, setRuns: vi.fn(), marginMode: 'net', setMarginMode: vi.fn() }),
  useBuildPlan: (): Partial<BuildPlanValue> => ({
    ownedMe: null,
    ownedTe: null,
    meOverrides: new Map([[100, 10]]),
    teOverrides: new Map(),
    setMeOverride: vi.fn(),
    resetMeOverride: vi.fn(),
    setTeOverride: vi.fn(),
    resetTeOverride: vi.fn(),
  }),
}));

import { PlannerRail } from './PlannerRail';

const structure = (activityId: number) =>
  ({
    blueprintTypeId: 100,
    activityId,
    product: { typeId: 200, name: 'Damage Control II', quantityPerRun: 1 },
    buildNodeDisplay: { 200: { label: 'Damage Control' } },
  }) as unknown as BlueprintStructure;

const row = (id: string, name: string): IndustryProfileRow => ({
  id,
  name,
  revision: 1,
  document: emptyProfileDocument([{ characterId: 9001, name: 'Builder' }]),
  updatedAt: '2026-10-02T00:00:00.000Z',
});

const render = (activityId = MANUFACTURING_ACTIVITY) =>
  renderToStaticMarkup(createElement(PlannerRail, { structure: structure(activityId), ledgerShown: false, onToggleLedger: vi.fn() }));

beforeEach(() => {
  h.auth = { session: null, loading: false };
  h.favorites = null;
  h.setup = { profiles: null, profilesFailed: false, refreshProfiles: vi.fn(), profile: null, setProfileId: vi.fn(), locationFailed: false, retryLocation: vi.fn() };
});

test('the rail leads back to the search, then shows the blueprint, its inputs and its numbers', () => {
  const html = render();
  expect(html).toMatch(/<a[^>]*href="\/industry\/planner"[^>]*>.*Back to search<\/a>/);
  expect(html.indexOf('Back to search')).toBeLessThan(html.indexOf('Damage Control II'));
  expect(html).toContain('aria-label="Blueprint"');
  expect(html).toContain('Damage Control II');
  expect(html).toContain('Damage Control<');
  expect(html).toContain('1 per run');
  expect(html).toContain('Manufacturing');
  expect(html).toContain('>Multibuy<');
  expect(html).toMatch(/aria-pressed="false"[^>]*><span>Raw ledger/);
  expect(html).toContain('>Profiles<');
  expect(html).toContain('aria-label="main blueprint material efficiency"');
  expect(html).toContain('aria-label="main blueprint time efficiency"');
  expect(html).toContain('aria-label="Runs"');
  expect(html).toContain('kpis');
});

test('a reaction has no blueprint research to set, only runs', () => {
  const html = render(REACTION_ACTIVITY);
  expect(html).not.toContain('material efficiency');
  expect(html).not.toContain('time efficiency');
  expect(html).toContain('aria-label="Runs"');
});

test('the profile slot holds its place while loading, asks a signed-out user to sign in, leads a new user to the Profiles tab, retries a failed list, and switches profiles', () => {
  h.auth = { session: null, loading: true };
  expect(render()).toContain('Loading profiles');

  h.auth = { session: null, loading: false };
  const signedOut = render();
  expect(signedOut).toMatch(/<button[^>]*>Create a profile<\/button>/);
  expect(signedOut).not.toContain('href="/industry"');
  expect(signedOut).not.toContain('Production profile');

  h.auth = { session: {}, loading: false };
  expect(render()).toContain('Loading profiles');

  h.setup = { ...h.setup, profiles: null, profilesFailed: true };
  const failed = render();
  expect(failed).toContain('role="alert"');
  expect(failed).toContain("Profiles didn&#x27;t load");
  expect(failed).toContain('aria-label="Retry loading profiles"');
  expect(failed).not.toContain('Loading profiles');
  expect(failed).not.toContain('Create a profile');

  h.setup = { ...h.setup, profiles: [], profilesFailed: false };
  const noProfile = render();
  expect(noProfile).toMatch(/<a[^>]*href="\/industry"[^>]*>Create a profile<\/a>/);
  expect(noProfile).not.toContain('role="alert"');

  const main = row('main', 'Main production');
  h.setup = { ...h.setup, profiles: [main, row('caps', 'Capital line')], profile: main };
  const switching = render();
  expect(switching).toContain('aria-label="Production profile"');
  expect(switching).toContain('Main production');
  expect(switching).not.toContain('Create a profile');
});

test('the star beside the name shows whether the blueprint is a favorite, and waits for the saved list', () => {
  const star = () => /<button[^>]*aria-label="Favorite"[^>]*>/.exec(render())![0];
  expect(star()).toContain('disabled=""');
  h.favorites = [{ typeId: 691, name: 'Rifter' }];
  expect(star()).toContain('aria-pressed="false"');
  expect(star()).not.toContain('disabled=""');
  h.favorites = [{ typeId: 100, name: 'Damage Control II' }];
  expect(star()).toContain('aria-pressed="true"');
  expect(render()).toMatch(/aria-label="Favorite"[^>]*><svg[^>]*class="fill-current"/);
});
