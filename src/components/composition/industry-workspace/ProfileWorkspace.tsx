'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { type ReactNode, type Ref, useCallback, useEffect, useMemo, useState, ViewTransition } from 'react';
import type { BoardCharacter } from '@/composition/board/api-contract';
import { useBoardLive } from '../board/use-board-live';
import { usePreference } from '@/components/PreferencesProvider';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { useAccountCharacters } from '@/components/use-account-characters';
import { flattenJobs } from '@/features/industry-jobs/flatten-jobs';
import type { ViewerCorpJobs, ViewerJobs } from '@/features/industry-jobs/live-derive';
import { useSlotsLive } from '@/features/industry-jobs/use-slots-live';
import type { IndustryProfileRow } from '@/features/industry-planner/profiles/api-contract';
import { addMember, setMemberCategories } from '@/features/industry-planner/profiles/assignments';
import type { ProfileDocument } from '@/features/industry-planner/profiles/profile-document';
import {
  type IndustryProfilesState,
  useIndustryProfiles,
} from '@/features/industry-planner/profiles/use-industry-profiles';
import type { AvailableStructure } from '@/features/industry-planner/types';
import { useAvailableStructures } from '@/features/industry-planner/use-available-structures';
import { industryProfile } from '@/lib/preferences';
import { useAuth } from '@/platform/auth/components/AuthProvider';
import { OVERVIEW_MOTION } from '../board/board-motion';
import { useFocusView } from '../board/use-focus-view';
import type { HullName } from './FacilitiesPanel';
import { MemberSheet } from './MemberDetail';
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
  characters: readonly BoardCharacter[];
  now: number;
  roster: readonly RosterCharacter[];
  capacities: ReadonlyMap<number, MemberCapacity>;
  levels: ReadonlyMap<number, Record<string, number> | null>;
  structures: readonly AvailableStructure[] | null;
  hulls: readonly HullName[];
}

/**
 * The open profile laid out like the home board: the member rail beside the
 * whole profile, or one member's sheet in their place. Every part the
 * transition animates is a direct child of the persistent container.
 */
function ProfileBoard({
  profile,
  controls,
  data,
  onEdit,
  onRemove,
}: {
  profile: IndustryProfileRow;
  controls: ReactNode;
  data: BoardData;
  onEdit: (next: ProfileDocument) => void;
  onRemove: (characterId: number) => void;
}) {
  const doc = profile.document;
  const resolve = useCallback((param: string | null) => memberView(param, doc), [doc]);
  const { view, open, toOverview, rootRef, backRef } = useFocusView(resolve, 'data-member-id');
  const { roster, capacities, levels, structures, hulls } = data;
  const members = railMembers(doc, roster);
  const member = view.view === 'character' ? members.find((m) => m.characterId === view.characterId) : undefined;

  if (member !== undefined) {
    return (
      <div ref={rootRef} role="article" aria-label={`${member.name} in ${profile.name}`} className={SHEET_GRID}>
        <OpenMember
          key={`${profile.id}:${member.characterId}`}
          controls={controls}
          doc={doc}
          member={member}
          character={data.characters.find((character) => character.characterId === member.characterId) ?? null}
          now={data.now}
          levels={levels}
          capacities={capacities}
          onBack={toOverview}
          backRef={backRef}
          onEdit={onEdit}
          onRemove={onRemove}
        />
      </div>
    );
  }
  return (
    <div ref={rootRef} className={OVERVIEW_GRID}>
      <ViewTransition {...OVERVIEW_MOTION} default="none">
        <div className="flex min-w-0 flex-col gap-6">
          {controls}
          <MemberRail
            members={members}
            addable={addableCharacters(doc, roster)}
            onSelect={open}
            onAdd={(character) => {
              onEdit(addMember(doc, { characterId: character.characterId, name: character.name }));
              open(character.characterId);
            }}
          />
        </div>
      </ViewTransition>
      <ViewTransition {...OVERVIEW_MOTION} default="none">
        <ProfileOverview
          key={profile.id}
          members={members}
          levels={levels}
          capacities={capacities}
          doc={doc}
          structures={structures}
          hulls={hulls}
          onEdit={onEdit}
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
  hulls,
}: {
  state: IndustryProfilesState & { profiles: IndustryProfileRow[] };
  roster: RosterCharacter[];
  jobs: WorkspaceJobs;
  corp: WorkspaceCorpJobs;
  corpEligible: boolean;
  hulls: readonly HullName[];
}) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const structures = useAvailableStructures();
  const board = useBoardLive();
  const { capacities, levels } = useCapacities(roster, jobs, corp, corpEligible);
  const { selection, selectProfile } = useProfileNavigation(state.profiles);
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
      <ProfileBoard
        profile={profile}
        controls={
          <ProfileBar
            profiles={state.profiles}
            selected={profile}
            busy={state.busy}
            onSelect={selectProfile}
            onAction={(action: ProfileAction) => setDialog({ kind: action })}
          />
        }
        data={{ roster, capacities, levels, structures, hulls, characters: board.response?.characters ?? [], now: board.now }}
        onEdit={(next) => state.save(profile.id, { name: profile.name, document: next })}
        onRemove={(characterId) => setDialog({ kind: 'remove-member', characterId })}
      />
      {dialogs}
    </div>
  );
}

function OpenMember({
  character,
  now,
  controls,
  doc,
  member,
  levels,
  capacities,
  onBack,
  backRef,
  onEdit,
  onRemove,
}: {
  controls: ReactNode;
  doc: ProfileDocument;
  character: BoardCharacter | null;
  now: number;
  member: RailMember;
  levels: ReadonlyMap<number, Record<string, number> | null>;
  capacities: ReadonlyMap<number, MemberCapacity>;
  onBack: () => void;
  backRef: Ref<HTMLButtonElement>;
  onEdit: (next: ProfileDocument) => void;
  onRemove: (characterId: number) => void;
}) {
  const { characterId } = member;
  return (
    <MemberSheet
      controls={controls}
      member={member}
      character={character}
      now={now}
      levels={levels.get(characterId) ?? null}
      capacities={capacities}
      onBack={onBack}
      backRef={backRef}
      onCategories={(categories) => onEdit(setMemberCategories(doc, characterId, categories))}
      onRemove={() => onRemove(characterId)}
    />
  );
}

/**
 * The industry landing: production profiles laid out like the home board.
 * The profile selector and members sit on the left beside the profile's skills;
 * opening one swaps both for that member's sheet. Jobs come in from the page
 * so they are read once.
 */
export function ProfileWorkspace({
  jobs,
  corp,
  corpEligible,
  hulls,
}: {
  jobs: WorkspaceJobs;
  corp: WorkspaceCorpJobs;
  corpEligible: boolean;
  hulls: readonly HullName[];
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
      hulls={hulls}
    />
  );
}
