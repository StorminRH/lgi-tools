'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { type Ref, useCallback, useEffect, useMemo, useState, ViewTransition } from 'react';
import { usePreference } from '@/components/PreferencesProvider';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { useAccountCharacters } from '@/components/use-account-characters';
import { useSystemSearch } from '@/components/use-system-search';
import { type SecurityClass, systemSecurityClass } from '@/data/eve-data/security';
import { flattenJobs } from '@/features/industry-jobs/flatten-jobs';
import type { ViewerCorpJobs, ViewerJobs } from '@/features/industry-jobs/live-derive';
import { useSlotsLive } from '@/features/industry-jobs/use-slots-live';
import type { IndustryProfileRow } from '@/features/industry-planner/profiles/api-contract';
import { type ProfileDocument, RESPONSIBILITIES } from '@/features/industry-planner/profiles/profile-document';
import {
  addMember,
  setDefaultFacility,
  setResponsibility,
  setRuleFacility,
} from '@/features/industry-planner/profiles/responsibilities';
import {
  type IndustryProfilesState,
  useIndustryProfiles,
} from '@/features/industry-planner/profiles/use-industry-profiles';
import { useAvailableStructures } from '@/features/industry-planner/use-available-structures';
import { industryProfile } from '@/lib/preferences';
import { useAuth } from '@/platform/auth/components/AuthProvider';
import { OVERVIEW_MOTION } from '../board/board-motion';
import { useFocusView } from '../board/use-focus-view';
import { type FacilityContext, MemberSheet } from './MemberDetail';
import { MemberRail } from './MemberRail';
import { ProfileBar, type ProfileAction } from './ProfileBar';
import { ProfileOverview } from './ProfileOverview';
import { type DialogState, WorkspaceDialogs } from './WorkspaceDialogs';
import { FirstProfile, SignedOutWorkspace, WorkspaceSkeleton } from './WorkspaceStates';
import {
  addableCharacters,
  type CapacitySources,
  type MemberCapacity,
  memberCapacity,
  memberView,
  profileHref,
  profileSummary,
  type RailMember,
  railMembers,
  resolveSelection,
  type RosterCharacter,
} from './workspace-model';

export interface WorkspaceJobs {
  jobsByCharacter: Map<number, ViewerJobs>;
  loading: boolean;
  failed: boolean;
}

export interface WorkspaceCorpJobs {
  corporations: ViewerCorpJobs[];
  loading: boolean;
  failed: boolean;
}

/**
 * Slot capacity and usage for every linked character, from one skills read
 * and the page's one jobs read. Selecting a portrait reads nothing new.
 */
function useCapacities(
  roster: readonly RosterCharacter[] | null,
  jobs: WorkspaceJobs,
  corp: WorkspaceCorpJobs,
  corpEligible: boolean,
): { capacities: Map<number, MemberCapacity>; levels: Map<number, Record<string, number> | null> } {
  const slots = useSlotsLive();
  return useMemo(() => {
    const levels = new Map(slots.characters.map((c) => [c.characterId, c.levels]));
    // A corporation feed that has not answered could hide corp-installed jobs,
    // so usage stays unknown rather than looking free.
    const corpUnknown = corpEligible && (corp.loading || corp.failed);
    const sources: CapacitySources = {
      levelsByCharacter: levels,
      personalJobs: jobs.loading || jobs.failed || corpUnknown ? null : jobs.jobsByCharacter,
      corpJobs: flattenJobs(corp.corporations),
    };
    const capacities = new Map(
      (roster ?? []).map((c) => [c.characterId, memberCapacity(c.characterId, sources)]),
    );
    return { capacities, levels };
  }, [slots.characters, roster, jobs, corp, corpEligible]);
}

function useSecurityOf(): (systemId: number | null) => SecurityClass | null {
  const { systems } = useSystemSearch();
  return useCallback(
    (systemId: number | null) => {
      if (systemId === null) return null;
      const system = systems.find((s) => s.id === systemId);
      return system === undefined ? null : systemSecurityClass(system.security, null);
    },
    [systems],
  );
}

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <Banner tone="warn">
      <span className="flex flex-wrap items-center gap-3">
        Your production profiles could not be loaded.
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </span>
    </Banner>
  );
}

/**
 * Which profile is open. The link decides; the remembered profile fills in
 * when the link does not, and follows whatever is open. Switching rewrites
 * the address in place and closes any open member.
 */
function useProfileNavigation(profiles: readonly IndustryProfileRow[]) {
  const params = useSearchParams();
  const pathname = usePathname();
  const [remembered, setRemembered] = usePreference(industryProfile);
  const selection = resolveSelection(profiles, params.get('profile'), remembered);
  const selectedProfileId = selection.profile?.id ?? null;

  useEffect(() => {
    if (selectedProfileId !== null && selectedProfileId !== remembered) setRemembered(selectedProfileId);
  }, [selectedProfileId, remembered, setRemembered]);

  const selectProfile = (id: string | null) => {
    if (id !== null) setRemembered(id);
    window.history.replaceState(null, '', profileHref(pathname, window.location.search, id));
  };
  return { selection, selectProfile };
}

const OVERVIEW_GRID = 'grid scroll-mt-28 grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-x-10';
const SHEET_GRID = 'grid scroll-mt-28 gap-x-10 gap-y-6 xl:grid-cols-[280px_minmax(0,1fr)]';

function characterNamer(
  roster: readonly RosterCharacter[],
  doc: ProfileDocument | null,
): (characterId: number) => string {
  const names = new Map<number, string>(doc?.members.map((m) => [m.characterId, m.name]) ?? []);
  for (const character of roster) names.set(character.characterId, character.name);
  return (characterId) => names.get(characterId) ?? `Character ${characterId}`;
}

interface BoardData {
  roster: readonly RosterCharacter[];
  linkedIds: ReadonlySet<number>;
  capacities: ReadonlyMap<number, MemberCapacity>;
  levels: ReadonlyMap<number, Record<string, number> | null>;
  context: FacilityContext;
}

/**
 * The open profile laid out like the home board: the member rail beside the
 * whole profile, or one member's sheet in their place. Every part the
 * transition animates is a direct child of the persistent container.
 */
function ProfileBoard({
  profile,
  data,
  onEdit,
  onRemove,
}: {
  profile: IndustryProfileRow;
  data: BoardData;
  onEdit: (next: ProfileDocument) => void;
  onRemove: (characterId: number) => void;
}) {
  const doc = profile.document;
  const resolve = useCallback((param: string | null) => memberView(param, doc), [doc]);
  const { view, open, toOverview, rootRef, backRef } = useFocusView(resolve, 'data-member-id');
  const { roster, linkedIds, capacities, levels, context } = data;
  const members = railMembers(doc, roster);
  const member = view.view === 'character' ? members.find((m) => m.characterId === view.characterId) : undefined;

  if (member !== undefined) {
    return (
      <div ref={rootRef} role="article" aria-label={`${member.name} in ${profile.name}`} className={SHEET_GRID}>
        <OpenMember
          key={`${profile.id}:${member.characterId}`}
          doc={doc}
          member={member}
          levels={levels}
          capacities={capacities}
          context={context}
          onBack={toOverview}
          backRef={backRef}
          onEdit={onEdit}
          onRemove={onRemove}
        />
      </div>
    );
  }
  const structures = context.structures;
  const availableFacilityIds = structures === null ? null : new Set(structures.map((s) => s.id));
  return (
    <div ref={rootRef} className={OVERVIEW_GRID}>
      <ViewTransition {...OVERVIEW_MOTION} default="none">
        <MemberRail
          members={members}
          addable={addableCharacters(doc, roster)}
          onSelect={open}
          onAdd={(character) => {
            onEdit(addMember(doc, { characterId: character.characterId, name: character.name }));
            open(character.characterId);
          }}
        />
      </ViewTransition>
      <ViewTransition {...OVERVIEW_MOTION} default="none">
        <ProfileOverview
          key={profile.id}
          summary={profileSummary({ doc, linkedIds, capacities, availableFacilityIds })}
          members={members}
          levels={levels}
          capacities={capacities}
          doc={doc}
          structures={structures}
          onDefault={(activity, next) => onEdit(setDefaultFacility(doc, activity, next))}
        />
      </ViewTransition>
    </div>
  );
}

function ProfileWorkspaceBody({
  state,
  roster,
  jobs,
  corp,
  corpEligible,
}: {
  state: IndustryProfilesState & { profiles: IndustryProfileRow[] };
  roster: RosterCharacter[];
  jobs: WorkspaceJobs;
  corp: WorkspaceCorpJobs;
  corpEligible: boolean;
}) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const structures = useAvailableStructures();
  const securityOf = useSecurityOf();
  const { capacities, levels } = useCapacities(roster, jobs, corp, corpEligible);
  const { selection, selectProfile } = useProfileNavigation(state.profiles);
  const linkedIds = useMemo(() => new Set(roster.map((c) => c.characterId)), [roster]);
  const profile = selection.profile;

  const dialogs = (
    <WorkspaceDialogs
      dialog={dialog}
      profile={profile}
      ctx={{
        state,
        roster,
        nameOf: characterNamer(roster, profile?.document ?? null),
        onClose: () => setDialog(null),
        onSelectProfile: selectProfile,
      }}
    />
  );

  if (profile === null) {
    return (
      <>
        <FirstProfile busy={state.busy} onCreate={() => setDialog({ kind: 'create' })} />
        {dialogs}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {selection.missingProfileId !== null ? (
        <Banner tone="info" onDismiss={() => selectProfile(profile.id)} dismissLabel="Dismiss">
          The profile in this link no longer exists. Showing {profile.name}.
        </Banner>
      ) : null}
      <ProfileBar
        profiles={state.profiles}
        selected={profile}
        busy={state.busy}
        onSelect={selectProfile}
        onAction={(action: ProfileAction) => setDialog({ kind: action })}
      />
      <ProfileBoard
        profile={profile}
        data={{ roster, linkedIds, capacities, levels, context: { structures, securityOf } }}
        onEdit={(next) => state.save(profile.id, { name: profile.name, document: next })}
        onRemove={(characterId) => setDialog({ kind: 'remove-member', characterId })}
      />
      {dialogs}
    </div>
  );
}

function OpenMember({
  doc,
  member,
  levels,
  capacities,
  context,
  onBack,
  backRef,
  onEdit,
  onRemove,
}: {
  doc: ProfileDocument;
  member: RailMember;
  levels: ReadonlyMap<number, Record<string, number> | null>;
  capacities: ReadonlyMap<number, MemberCapacity>;
  context: FacilityContext;
  onBack: () => void;
  backRef: Ref<HTMLButtonElement>;
  onEdit: (next: ProfileDocument) => void;
  onRemove: (characterId: number) => void;
}) {
  const { characterId } = member;
  return (
    <MemberSheet
      doc={doc}
      member={member}
      levels={levels.get(characterId) ?? null}
      capacities={capacities}
      context={context}
      onBack={onBack}
      backRef={backRef}
      onRoles={(roles) =>
        onEdit(
          RESPONSIBILITIES.reduce(
            (next, r) => setResponsibility(next, characterId, r, roles.includes(r)),
            doc,
          ),
        )
      }
      onFacility={(responsibility, facility) =>
        onEdit(setRuleFacility(doc, characterId, responsibility, facility))
      }
      onRemove={() => onRemove(characterId)}
    />
  );
}

/**
 * The industry landing: production profiles laid out like the home board.
 * Members sit on the left beside the whole profile's totals and skills;
 * opening one swaps both for that member's sheet. Jobs come in from the page
 * so they are read once.
 */
export function ProfileWorkspace({
  jobs,
  corp,
  corpEligible,
}: {
  jobs: WorkspaceJobs;
  corp: WorkspaceCorpJobs;
  corpEligible: boolean;
}) {
  const { session, loading } = useAuth();
  const state = useIndustryProfiles(session !== null);
  const roster = useAccountCharacters();

  if (loading) return <WorkspaceSkeleton />;
  if (session === null) return <SignedOutWorkspace />;
  if (state.profiles === null) {
    return state.listFailed ? <LoadFailed onRetry={state.refresh} /> : <WorkspaceSkeleton />;
  }
  if (roster === null) return <WorkspaceSkeleton />;
  return (
    <ProfileWorkspaceBody
      state={{ ...state, profiles: state.profiles }}
      roster={roster}
      jobs={jobs}
      corp={corp}
      corpEligible={corpEligible}
    />
  );
}
