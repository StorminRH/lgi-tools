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
}));

vi.mock('@/platform/auth/components/AuthProvider', () => ({ useAuth: () => h.auth }));
vi.mock('@/platform/auth/auth-client', () => ({ authClient: { signIn: { oauth2: vi.fn() } } }));
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
  h.setup = { profiles: null, profile: null, setProfileId: vi.fn() };
});

test('the rail shows the blueprint, its inputs and its numbers', () => {
  const html = render();
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

test('signed out, the profile slot asks for one; signing in is the way there', () => {
  const html = render();
  expect(html).toMatch(/<button[^>]*>Create a profile<\/button>/);
  expect(html).not.toContain('href="/industry"');
  expect(html).not.toContain('Production profile');
});

test('while auth or the profile list loads the slot holds its place', () => {
  h.auth = { session: null, loading: true };
  expect(render()).toContain('Loading profiles');
  h.auth = { session: {}, loading: false };
  expect(render()).toContain('Loading profiles');
});

test('signed in without a profile, the slot leads to the Profiles tab', () => {
  h.auth = { session: {}, loading: false };
  h.setup = { ...h.setup, profiles: [] };
  const html = render();
  expect(html).toMatch(/<a[^>]*href="\/industry"[^>]*>Create a profile<\/a>/);
});

test('with profiles, the slot switches between them', () => {
  h.auth = { session: {}, loading: false };
  const main = row('main', 'Main production');
  h.setup = { ...h.setup, profiles: [main, row('caps', 'Capital line')], profile: main };
  const html = render();
  expect(html).toContain('aria-label="Production profile"');
  expect(html).toContain('Main production');
  expect(html).not.toContain('Create a profile');
});
