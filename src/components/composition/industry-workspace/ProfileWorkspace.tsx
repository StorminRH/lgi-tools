'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { type FacilityContext, MemberDetail } from './MemberDetail';
import { MemberRail } from './MemberRail';
import { ProfileBar, type ProfileAction } from './ProfileBar';
import { ProfileSummaryPanels, SummaryTiles } from './ProfileSummary';
import { type DialogState, WorkspaceDialogs } from './WorkspaceDialogs';
import { FirstProfile, SignedOutWorkspace, WorkspaceSkeleton } from './WorkspaceStates';
import {
  addableCharacters,
  type CapacitySources,
  type MemberCapacity,
  memberCapacity,
  profileSummary,
  type RailMember,
  railMembers,
  resolveSelection,
  type RosterCharacter,
  workspaceHref,
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
 * Which profile and member are open. The link decides; the remembered
 * profile fills in when the link does not, and follows whatever is open.
 * Selection rewrites the address in place so Back leaves the workspace
 * rather than stepping through portrait clicks.
 */
function useWorkspaceNavigation(profiles: readonly IndustryProfileRow[]) {
  const params = useSearchParams();
  const pathname = usePathname();
  const [remembered, setRemembered] = usePreference(industryProfile);
  const selection = resolveSelection(
    profiles,
    { profile: params.get('profile'), character: params.get('character') },
    remembered,
  );
  const selectedProfileId = selection.profile?.id ?? null;

  useEffect(() => {
    if (selectedProfileId !== null && selectedProfileId !== remembered) setRemembered(selectedProfileId);
  }, [selectedProfileId, remembered, setRemembered]);

  const navigate = (next: { profile: string | null; character: number | null }) => {
    window.history.replaceState(null, '', workspaceHref(pathname, window.location.search, next));
  };
  const selectProfile = (id: string | null) => {
    if (id !== null) setRemembered(id);
    navigate({ profile: id, character: null });
  };
  return { selection, navigate, selectProfile };
}

function characterNamer(
  roster: readonly RosterCharacter[],
  doc: ProfileDocument | null,
): (characterId: number) => string {
  const names = new Map<number, string>(doc?.members.map((m) => [m.characterId, m.name]) ?? []);
  for (const character of roster) names.set(character.characterId, character.name);
  return (characterId) => names.get(characterId) ?? `Character ${characterId}`;
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
  const { selection, navigate, selectProfile } = useWorkspaceNavigation(state.profiles);
  const linkedIds = useMemo(() => new Set(roster.map((c) => c.characterId)), [roster]);
  const profile = selection.profile;
  const nameOf = characterNamer(roster, profile?.document ?? null);

  const dialogs = (
    <WorkspaceDialogs
      dialog={dialog}
      profile={profile}
      ctx={{ state, roster, nameOf, onClose: () => setDialog(null), onSelectProfile: selectProfile }}
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

  const doc = profile.document;
  const edit = (next: ProfileDocument) => state.save(profile.id, { name: profile.name, document: next });
  const members = railMembers(doc, roster);
  const selected = members.find((m) => m.characterId === selection.characterId) ?? null;
  const availableFacilityIds = structures === null ? null : new Set(structures.map((s) => s.id));
  const summary = profileSummary({ doc, linkedIds, capacities, availableFacilityIds });
  const selectCharacter = (characterId: number) => navigate({ profile: profile.id, character: characterId });

  // Phones read the team before the profile-wide panels; wider screens keep
  // the summary as a header above the rail.
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
      <section aria-label="Profile summary">
        <SummaryTiles summary={summary} />
      </section>
      <ProfileSummaryPanels
        key={profile.id}
        className="order-last lg:order-none"
        summary={summary}
        doc={doc}
        linkedCount={linkedIds.size}
        nameOf={nameOf}
        structures={structures}
        onDefault={(activity, next) => edit(setDefaultFacility(doc, activity, next))}
        onSelectCharacter={selectCharacter}
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-x-10">
        <MemberRail
          members={members}
          selectedId={selected?.characterId ?? null}
          addable={addableCharacters(doc, roster)}
          onSelect={selectCharacter}
          onAdd={(character) => {
            edit(addMember(doc, { characterId: character.characterId, name: character.name }));
            selectCharacter(character.characterId);
          }}
        />
        <SelectedMember
          doc={doc}
          profileId={profile.id}
          member={selected}
          levels={levels}
          capacities={capacities}
          context={{ structures, securityOf }}
          onEdit={edit}
          onRemove={(characterId) => setDialog({ kind: 'remove-member', characterId })}
        />
      </div>
      {dialogs}
    </div>
  );
}

function SelectedMember({
  doc,
  profileId,
  member,
  levels,
  capacities,
  context,
  onEdit,
  onRemove,
}: {
  doc: ProfileDocument;
  profileId: string;
  member: RailMember | null;
  levels: ReadonlyMap<number, Record<string, number> | null>;
  capacities: ReadonlyMap<number, MemberCapacity>;
  context: FacilityContext;
  onEdit: (next: ProfileDocument) => void;
  onRemove: (characterId: number) => void;
}) {
  if (member === null) {
    return (
      <p className="text-ui text-muted">
        No one is on this profile yet. Add a linked character to give them responsibilities.
      </p>
    );
  }
  const { characterId } = member;
  return (
    <MemberDetail
      key={`${profileId}:${characterId}`}
      doc={doc}
      member={member}
      levels={levels.get(characterId) ?? null}
      capacity={capacities.get(characterId)}
      context={context}
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
 * The industry landing: production profiles laid out like the home board,
 * members on the left and the selected member beside them, the profile's
 * summary above. Jobs come in from the page so they are read once.
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
