import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { IndustryProfileRow } from '@/features/industry-planner/profiles/api-contract';
import { emptyProfileDocument } from '@/features/industry-planner/profiles/profile-document';
import { setResponsibility, setRuleFacility } from '@/features/industry-planner/profiles/responsibilities';
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
}));

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
vi.mock('@/components/use-system-search', () => ({
  useSystemSearch: () => ({ systems: [{ id: 30004759, name: '1DQ1-A', security: -0.4 }] }),
}));
vi.mock('@/features/industry-jobs/use-slots-live', () => ({
  useSlotsLive: () => ({ characters: live.slots, loading: false }),
}));
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
import { WorkspaceNav } from './WorkspaceStates';

const BUILDER = { characterId: 9001, name: 'Aurel Vantesse', portraitUrl: 'p/9001' };
const REACTOR = { characterId: 9002, name: 'Kessa Draymoor', portraitUrl: 'p/9002' };
const TATARA: AvailableStructure = {
  id: 'corp:77',
  source: 'corp',
  name: 'Moon Tatara',
  structureTypeId: 35836,
  groupId: 1406,
  systemId: 30004759,
  structureAttrs: { 2721: 0.75 },
  rigAttrs: [],
  securityClass: 'null',
  taxPct: 0.5,
};

function render(): string {
  const jobs = { jobsByCharacter: new Map(), loading: false, failed: false };
  const corp = { corporations: [], loading: false, failed: false };
  return renderToStaticMarkup(createElement(ProfileWorkspace, { jobs, corp, corpEligible: false }));
}

function teamProfile(): IndustryProfileRow {
  let doc = emptyProfileDocument([
    { characterId: BUILDER.characterId, name: BUILDER.name },
    { characterId: REACTOR.characterId, name: REACTOR.name },
    { characterId: 9003, name: 'Old Alt' },
  ]);
  doc = setResponsibility(doc, BUILDER.characterId, 'components', true);
  doc = setResponsibility(doc, BUILDER.characterId, 'final-assembly', true);
  doc = setResponsibility(doc, REACTOR.characterId, 'reactions', true);
  doc = setRuleFacility(doc, REACTOR.characterId, 'reactions', { id: TATARA.id, name: TATARA.name });
  return { id: 'caps', name: 'Capital line', revision: 4, document: doc, updatedAt: '2026-09-29T00:00:00.000Z' };
}

test('the workspace walks from signed out, to a first profile, to a team and one member', () => {
  expect(renderToStaticMarkup(createElement(WorkspaceNav))).toContain('aria-current="page"');

  live.session = null;
  const signedOut = render();
  expect(signedOut).toContain('Log in with EVE Online');
  expect(signedOut).not.toContain('Create profile');

  live.session = { characterId: BUILDER.characterId };
  live.roster = [BUILDER, REACTOR];
  live.profiles = null;
  expect(render()).toContain('Loading production profiles');

  live.listFailed = true;
  expect(render()).toContain('could not be loaded');
  live.listFailed = false;

  live.profiles = [];
  expect(render()).toContain('Create your first production profile');

  live.profiles = [teamProfile(), { ...teamProfile(), id: 'rx', name: 'Reactions only' }];
  live.slots = [
    { characterId: BUILDER.characterId, levels: { 3380: 5, 3388: 4, 3387: 4, 24625: 3 } },
    { characterId: REACTOR.characterId, levels: null },
  ];
  live.structures = [TATARA];
  // With no member open, the rail sits beside the whole profile.
  live.params = new URLSearchParams('profile=caps');
  const team = render();
  expect(team).toContain('Capital line');
  expect(team).toContain('3/3');
  expect(team).toContain(`data-member-id="${BUILDER.characterId}"`);
  expect(team).toContain(`${BUILDER.name}: Components · Final assembly`);
  // An unlinked member stays on the team as unresolved.
  expect(team).toContain('Old Alt: No responsibilities, not linked');
  expect(team).toContain('1 not linked');
  expect(team).toContain('Production skills by member');
  expect(team).toContain('Default facilities');
  // Unknown jobs stay unknown rather than reading as free slots.
  expect(team).toContain('In use unknown');
  expect(team).not.toContain('All members');
  expect(team).not.toContain('The profile in this link no longer exists');

  // A member in the link opens on its own sheet in place of the rail.
  live.params = new URLSearchParams(`profile=caps&character=${REACTOR.characterId}`);
  const reactor = render();
  expect(reactor).toContain(`aria-label="${REACTOR.name} in Capital line"`);
  expect(reactor).toContain('All members');
  expect(reactor).not.toContain('data-member-id');
  // Skills that have not synced are said to be syncing, not shown as zero.
  expect(reactor).toContain('Skills are still syncing from EVE.');
  expect(reactor).toContain('Reaction material bonuses from rigs are not modelled yet.');
  expect(reactor).toContain(`Remove ${REACTOR.name} from this profile`);

  // A member that is not on the profile shows the whole profile instead.
  live.params = new URLSearchParams('profile=caps&character=12345');
  expect(render()).toContain('Production skills by member');

  live.params = new URLSearchParams('profile=deleted');
  const deadLink = render();
  expect(deadLink).toContain('The profile in this link no longer exists. Showing Capital line.');
  expect(deadLink).toContain(`data-member-id="${BUILDER.characterId}"`);
});
