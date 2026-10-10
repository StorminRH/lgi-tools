import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { BoardCharacter } from '@/composition/board/api-contract';
import { industryJob } from '@/features/industry-jobs/__tests__/job-fixture';
import type { ViewerJobs } from '@/features/industry-jobs/live-derive';
import type { IndustryProfileRow } from '@/features/industry-planner/profiles/api-contract';
import { addFacility, setMemberCategories } from '@/features/industry-planner/profiles/assignments';
import { emptyProfileDocument, MAX_PROFILE_FACILITIES } from '@/features/industry-planner/profiles/profile-document';
import type { AvailableStructure } from '@/features/industry-planner/types';

const live = vi.hoisted(() => ({
  session: null as null | { characterId: number },
  authLoading: false,
  profiles: null as IndustryProfileRow[] | null,
  listFailed: false,
  roster: null as null | { characterId: number; name: string; portraitUrl: string }[],
  slots: [] as { characterId: number; levels: Record<string, number> | null }[],
  structures: null as AvailableStructure[] | null,
  remembered: null as string | null,
  params: new URLSearchParams(),
  boardCharacters: null as BoardCharacter[] | null,
  now: Date.parse('2026-10-01T12:00:00Z'),
}));
const useBoardLive = vi.hoisted(() =>
  vi.fn(() => ({
    response: live.boardCharacters === null ? null : { characters: live.boardCharacters },
    now: live.now,
  })),
);

// Next serves the app its canary React, which has <ViewTransition>; the stable
// React that vitest resolves does not, so stand in a pass-through.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  ViewTransition: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    createElement('a', { ...props, href: String(href) }, children),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => live.params,
  usePathname: () => '/industry',
}));
vi.mock('@/components/eve-image', () => ({
  EveImage: ({ alt }: { alt: string }) => createElement('span', { 'data-alt': alt }),
}));
vi.mock('../account/LoginButton', () => ({
  EveSignInButton: () => createElement('button', { type: 'button' }, 'Log in with EVE Online'),
}));
vi.mock('@/platform/auth/components/AuthProvider', () => ({
  useAuth: () => ({ session: live.session, loading: live.authLoading }),
}));
vi.mock('@/platform/auth/link-character', () => ({ startCharacterLink: vi.fn() }));
vi.mock('@/components/use-account-characters', () => ({ useAccountCharacters: () => live.roster }));
vi.mock('@/components/PreferencesProvider', () => ({
  usePreference: () => [live.remembered, vi.fn()],
}));
vi.mock('@/features/industry-jobs/use-slots-live', () => ({
  useSlotsLive: () => ({ characters: live.slots, loading: false }),
}));
vi.mock('../board/use-board-live', () => ({ useBoardLive }));
vi.mock('@/features/industry-planner/use-available-structures', () => ({
  useAvailableStructures: () => live.structures,
}));
vi.mock('@/features/industry-planner/profiles/use-industry-profiles', () => ({
  useIndustryProfiles: () => ({
    profiles: live.profiles,
    listFailed: live.listFailed,
    busy: false,
    refresh: vi.fn(),
    create: vi.fn(),
    duplicate: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
  }),
}));

import { ProfileWorkspace } from './ProfileWorkspace';

const BUILDER = { characterId: 9001, name: 'Aurel Vantesse', portraitUrl: 'p/9001' };
const REACTOR = { characterId: 9002, name: 'Kessa Draymoor', portraitUrl: 'p/9002' };
const TATARA: AvailableStructure = {
  id: 'corp:77',
  source: 'corp',
  name: 'Moon Tatara',
  structureTypeId: 35836,
  groupId: 1406,
  hostsCapitals: false,
  systemId: 30004759,
  targetFilterSets: [[]],
  modifiers: [{ activity: 'reaction', kind: 'time', filterId: null, factor: { high: 0.75, low: 0.75, null: 0.75 } }],
  enteredBonuses: null,
  securityClass: 'null',
  taxPct: 0.5,
};

function render(jobsByCharacter: Map<number, ViewerJobs> = new Map()): string {
  const jobs = { jobsByCharacter, loading: false, failed: false };
  const corp = { corporations: [], loading: false, failed: false };
  const hulls = [{ typeId: 35836, name: 'Tatara' }];
  return renderToStaticMarkup(createElement(ProfileWorkspace, { jobs, corp, corpEligible: false, hulls }));
}

function capacityReadout(html: string): string {
  const capacity = html.match(/<dl aria-label="Production capacity"[^>]*>([\s\S]*?)<\/dl>/);
  expect(capacity).not.toBeNull();
  return capacity?.[1] ?? '';
}

/** A member's slot cells in the team table, in manufacturing, reactions, science order. */
function slotCells(html: string, name: string): string[] {
  const table = html.match(/<table aria-label="Production skills by member"[^>]*>([\s\S]*?)<\/table>/);
  expect(table).not.toBeNull();
  const row = (table?.[1] ?? '').split('</tr>').find((tr) => tr.includes(name)) ?? '';
  return [...row.matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map((cell) => cell[1] ?? '');
}

function jobsFor(characterId: number, activities: readonly number[]): ViewerJobs {
  return {
    characterId,
    lastRefreshedAt: 1,
    data: {
      jobs: activities.map((activity_id, index) =>
        industryJob({ job_id: characterId * 10 + index, activity_id, status: 'active' })),
    },
  };
}

function teamProfile(): IndustryProfileRow {
  let doc = emptyProfileDocument([
    { characterId: BUILDER.characterId, name: BUILDER.name },
    { characterId: REACTOR.characterId, name: REACTOR.name },
    { characterId: 9003, name: 'Old Alt' },
  ]);
  doc = setMemberCategories(doc, BUILDER.characterId, ['capital-ships', 'components']);
  doc = setMemberCategories(doc, REACTOR.characterId, ['reactions']);
  doc = addFacility(doc, { kind: 'structure', id: TATARA.id, name: TATARA.name, systemId: TATARA.systemId, categories: ['reactions'] });
  doc = addFacility(doc, {
    kind: 'station',
    id: '60003760',
    name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
    systemId: 30000142,
    categories: ['manufacturing'],
  });
  return { id: 'caps', name: 'Capital line', revision: 4, document: doc, updatedAt: '2026-09-29T00:00:00.000Z' };
}

test('the workspace walks from signed out, to a first profile, to a team and one member', () => {
  live.session = null;
  const signedOut = render();
  expect(signedOut).toContain('Log in with EVE Online');
  expect(signedOut).not.toContain('Create profile');

  live.session = { characterId: BUILDER.characterId };
  live.roster = [BUILDER, REACTOR];
  live.profiles = null;
  expect(render()).toContain('Loading production profiles');

  live.listFailed = true;
  const failed = render();
  expect(failed).toContain("Profiles didn&#x27;t load");
  expect(failed).toContain('aria-label="Retry loading profiles"');
  live.listFailed = false;

  live.profiles = [];
  const first = render();
  expect(first).toContain('Create your first production profile');

  live.profiles = [teamProfile(), { ...teamProfile(), id: 'rx', name: 'Reactions only' }];
  live.slots = [
    { characterId: BUILDER.characterId, levels: { 3380: 5, 3388: 4, 3387: 4, 24625: 3 } },
    { characterId: REACTOR.characterId, levels: null },
  ];
  live.structures = [TATARA];
  // With no member open, the rail sits beside the whole profile, and the
  // account board, which only a member's identity needs, stays unread.
  live.params = new URLSearchParams('profile=caps');
  useBoardLive.mockClear();
  const team = render();
  expect(useBoardLive).not.toHaveBeenCalled();
  expect(team).toContain('Capital line');
  expect(team).toContain(`data-member-id="${BUILDER.characterId}"`);
  expect(team).toContain(`${BUILDER.name}: Capital ships · All components`);
  // An unlinked member stays on the team as unresolved.
  expect(team).toContain('Old Alt: Nothing assigned, not linked');
  expect(team).toContain('Not linked');
  expect(team).toContain('Production skills by member');
  expect(team).toContain('>Facilities<');
  // Each facility names what it builds; the station reads as one.
  expect(team).toContain('Moon Tatara');
  expect(team).toContain('All reactions');
  expect(team).toContain('NPC station');
  expect(team).toContain('All manufacturing');
  expect(team).toContain('aria-label="Add a facility"');
  expect(team).toContain('Production Capacity');
  expect(capacityReadout(team)).toContain('?/8+');
  // Each member's row reads its slots the way the panel does: known totals
  // beside unknown usage, and "?" for skills that have not synced.
  expect(slotCells(team, BUILDER.name)).toEqual(['?/8', '?/1', '?/1']);
  expect(slotCells(team, REACTOR.name)).toEqual(['?/?', '?/?', '?/?']);
  expect(team).toContain('1 unlinked character is excluded.');
  // Skills that have not synced stay unknown rather than showing a zero bonus.
  expect(team).toContain('Syncing');
  expect(team).not.toContain('All members');
  expect(team).not.toContain('The profile in this link no longer exists');

  // A member in the link opens on its own sheet in place of the rail, which
  // reads the account board once for its identity.
  live.params = new URLSearchParams(`profile=caps&character=${REACTOR.characterId}`);
  const reactor = render();
  expect(useBoardLive).toHaveBeenCalledTimes(1);
  expect(reactor).toContain(`aria-label="${REACTOR.name} in Capital line"`);
  expect(reactor).toContain('All members');
  expect(reactor).not.toContain('data-member-id');
  // Skills that have not synced are said to be syncing, not shown as zero.
  expect(reactor).toContain('Skills are still syncing from EVE.');
  expect(capacityReadout(reactor)).toContain('?/?');
  expect(reactor).not.toContain('Manage structures');
  expect(reactor).toContain(`What ${REACTOR.name} builds</legend>`);
  const categories = reactor.match(/<[^>]*role="checkbox"[^>]*>/g) ?? [];
  expect(categories).toHaveLength(22);
  const box = (label: string) => categories.find((checkbox) => checkbox.includes(`aria-label="${label}"`)) ?? '';
  expect(box('All reactions')).toContain('aria-checked="true"');
  // A ticked parent covers its classes, which read as ticked and stay put.
  expect(box('Composite reactions')).toContain('aria-checked="true"');
  expect(box('Composite reactions')).toContain('aria-disabled="true"');
  expect(box('All components')).toContain('aria-checked="false"');
  expect(reactor).toContain('aria-label="All manufacturing"');
  expect(reactor).toContain('aria-label="All ships"');
  expect(reactor).toContain('aria-label="Small T1 ships"');
  expect(reactor).toContain('aria-label="Hybrid reactions"');
  expect(reactor).toContain(`Remove ${REACTOR.name} from this profile`);

  // A member that is not on the profile shows the whole profile instead.
  live.params = new URLSearchParams('profile=caps&character=12345');
  expect(render()).toContain('Production skills by member');

  live.params = new URLSearchParams('profile=deleted');
  const deadLink = render();
  expect(deadLink).toContain('The profile in this link no longer exists. Showing Capital line.');
  expect(deadLink).toContain(`data-member-id="${BUILDER.characterId}"`);

  // The capacity card scopes both usage and totals to linked profile members,
  // even when another linked character has skills and jobs available.
  const spare = { characterId: 9004, name: 'Other builder', portraitUrl: 'p/9004' };
  live.roster = [BUILDER, REACTOR, spare];
  live.slots = [
    { characterId: BUILDER.characterId, levels: { 3387: 4, 24625: 3 } },
    { characterId: REACTOR.characterId, levels: { 3387: 2, 3406: 3, 45748: 5 } },
    { characterId: spare.characterId, levels: { 3387: 5, 24625: 5, 3406: 5, 45748: 5 } },
  ];
  live.params = new URLSearchParams('profile=caps');
  expect(capacityReadout(render())).toContain('?/11');
  const jobsByCharacter = new Map([
    [BUILDER.characterId, jobsFor(BUILDER.characterId, [1, 1, 3])],
    [REACTOR.characterId, jobsFor(REACTOR.characterId, [1, 11, 11, 3])],
    [spare.characterId, jobsFor(spare.characterId, [1, 1, 1, 11])],
  ]);
  const teamCapacity = capacityReadout(render(jobsByCharacter));
  expect(teamCapacity).toContain('3/11');
  expect(teamCapacity).toContain('2/7');
  expect(teamCapacity).toContain('2/5');
  expect(teamCapacity).not.toContain('?');

  live.params = new URLSearchParams(`profile=caps&character=${REACTOR.characterId}`);
  const reactorCapacity = capacityReadout(render(jobsByCharacter));
  expect(reactorCapacity).toContain('1/3');
  expect(reactorCapacity).toContain('2/6');
  expect(reactorCapacity).toContain('1/4');

  live.params = new URLSearchParams('profile=caps&character=9003');
  const unlinked = render(jobsByCharacter);
  expect(unlinked).toContain('Link a character in this selection to see its production capacity.');
  expect(unlinked).not.toContain('aria-label="Production capacity"');

  // The selected linked member gets its own live identity, while an unlinked
  // profile member never reuses stale account-board details.
  const identity: BoardCharacter = {
    ...REACTOR,
    corporation: { id: 77, name: 'Reactor corporation' },
    alliance: { id: 88, name: 'Production alliance' },
    gaps: [],
    profile: { state: 'ready', refreshedAt: live.now, data: { birthday: '2020-10-01T00:00:00Z', securityStatus: 4.6 } },
    status: {
      state: 'ready',
      refreshedAt: live.now,
      data: {
        online: true,
        lastLogin: null,
        system: { id: 30000142, name: 'Jita', security: 0.9, secClass: 'high' },
        dock: null,
        ship: { typeId: 587, typeName: 'Rifter', name: 'Rifter' },
      },
    },
    skills: { state: 'pending' },
    attributes: { state: 'pending' },
    implants: { state: 'pending' },
    clones: { state: 'pending' },
    wallet: { state: 'pending' },
    journal: { state: 'pending' },
    industry: { state: 'pending' },
    netWorth: { state: 'pending' },
  };
  live.boardCharacters = [
    { ...identity, ...BUILDER, corporation: { id: 99, name: 'Other corporation' } },
    identity,
    { ...identity, characterId: 9003, name: 'Stale board name' },
  ];
  live.params = new URLSearchParams(`profile=caps&character=${REACTOR.characterId}`);
  const liveIdentity = render(jobsByCharacter);
  expect(liveIdentity).toContain('Reactor corporation');
  expect(liveIdentity).toContain('Production alliance');
  expect(liveIdentity).toContain('>4.6<');
  expect(liveIdentity).toContain('6y old');
  expect(liveIdentity).toContain('Online');
  expect(liveIdentity).not.toContain('Other corporation');

  live.params = new URLSearchParams('profile=caps&character=9003');
  const unlinkedIdentity = render(jobsByCharacter);
  expect(unlinkedIdentity).toContain('Old Alt');
  expect(unlinkedIdentity).not.toContain('Stale board name');
  expect(unlinkedIdentity).not.toContain('Reactor corporation');
  expect(unlinkedIdentity).not.toContain('6y old');
  expect(unlinkedIdentity).not.toContain('Online');

  live.boardCharacters = null;
  live.params = new URLSearchParams(`profile=caps&character=${REACTOR.characterId}`);
  const pendingIdentity = render(jobsByCharacter);
  expect(pendingIdentity).toContain(REACTOR.name);
  expect(pendingIdentity).not.toContain('Reactor corporation');
  expect(pendingIdentity).not.toContain('6y old');
  expect(pendingIdentity).not.toContain('Online');
});

test('a profile at its facility limit cannot take another', () => {
  live.session = { characterId: BUILDER.characterId };
  live.roster = [BUILDER, REACTOR];
  live.listFailed = false;
  live.structures = [TATARA];
  live.params = new URLSearchParams('profile=caps');
  const team = teamProfile();
  const stations = Array.from({ length: MAX_PROFILE_FACILITIES - team.document.facilities.length }, (_, i) => ({
    kind: 'station' as const,
    id: `${61000000 + i}`,
    name: `Station ${i}`,
    systemId: 30000142,
    categories: [],
  }));
  const addField = () => /<input[^>]*aria-label="Add a facility"[^>]*>/.exec(render())![0];
  live.profiles = [team];
  expect(addField()).toContain('placeholder="Add a facility"');
  expect(addField()).not.toContain('disabled=""');
  live.profiles = [{ ...team, document: { ...team.document, facilities: [...team.document.facilities, ...stations] } }];
  expect(addField()).toContain('placeholder="Facility limit reached"');
  expect(addField()).toContain('disabled=""');
});
