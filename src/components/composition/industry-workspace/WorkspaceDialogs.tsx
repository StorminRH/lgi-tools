'use client';

import type { IndustryProfileRow } from '@/features/industry-planner/profiles/api-contract';
import { emptyProfileDocument } from '@/features/industry-planner/profiles/profile-document';
import { copyName, suggestProfileName } from '@/features/industry-planner/profiles/profile-view';
import { removeMember } from '@/features/industry-planner/profiles/assignments';
import type { IndustryProfilesState } from '@/features/industry-planner/profiles/use-industry-profiles';
import { DeleteProfileDialog, ProfileNameDialog, RemoveMemberDialog } from './ProfileDialogs';
import type { RosterCharacter } from './workspace-model';

export type DialogState =
  | { kind: 'create' }
  | { kind: 'rename' }
  | { kind: 'duplicate' }
  | { kind: 'delete' }
  | { kind: 'remove-member'; characterId: number }
  | null;

export interface DialogContext {
  state: Pick<IndustryProfilesState, 'busy' | 'create' | 'duplicate' | 'save' | 'remove'> & {
    profiles: IndustryProfileRow[];
  };
  roster: readonly RosterCharacter[];
  nameOf: (characterId: number) => string;
  onClose: () => void;
  onSelectProfile: (id: string | null) => void;
}

/** Closes the dialog and opens the profile a create or copy produced. */
async function openCreated(ctx: DialogContext, pending: Promise<string | null>): Promise<void> {
  const id = await pending;
  if (id === null) return;
  ctx.onClose();
  ctx.onSelectProfile(id);
}

function CreateProfileDialog({ ctx }: { ctx: DialogContext }) {
  return (
    <ProfileNameDialog
      mode="create"
      initialName={suggestProfileName(ctx.state.profiles)}
      rosterSize={ctx.roster.length}
      busy={ctx.state.busy}
      onClose={ctx.onClose}
      onSubmit={(name, includeRoster) => {
        const members = includeRoster ? ctx.roster.map((c) => ({ characterId: c.characterId, name: c.name })) : [];
        void openCreated(ctx, ctx.state.create(name, emptyProfileDocument(members)));
      }}
    />
  );
}

function RenameProfileDialog({ ctx, profile }: { ctx: DialogContext; profile: IndustryProfileRow }) {
  return (
    <ProfileNameDialog
      mode="rename"
      initialName={profile.name}
      rosterSize={0}
      busy={ctx.state.busy}
      onClose={ctx.onClose}
      onSubmit={(name) => {
        ctx.state.save(profile.id, { name, document: profile.document });
        ctx.onClose();
      }}
    />
  );
}

function DuplicateProfileDialog({ ctx, profile }: { ctx: DialogContext; profile: IndustryProfileRow }) {
  return (
    <ProfileNameDialog
      mode="duplicate"
      initialName={copyName(profile.name, ctx.state.profiles)}
      rosterSize={0}
      busy={ctx.state.busy}
      onClose={ctx.onClose}
      onSubmit={(name) => void openCreated(ctx, ctx.state.duplicate(profile.id, name))}
    />
  );
}

function DeleteDialog({ ctx, profile }: { ctx: DialogContext; profile: IndustryProfileRow }) {
  return (
    <DeleteProfileDialog
      name={profile.name}
      busy={ctx.state.busy}
      onClose={ctx.onClose}
      onConfirm={() =>
        void ctx.state.remove(profile.id).then((removed) => {
          if (!removed) return;
          ctx.onClose();
          ctx.onSelectProfile(null);
        })
      }
    />
  );
}

function RemoveDialog({
  ctx,
  profile,
  characterId,
}: {
  ctx: DialogContext;
  profile: IndustryProfileRow;
  characterId: number;
}) {
  return (
    <RemoveMemberDialog
      name={ctx.nameOf(characterId)}
      categoryCount={profile.document.members.find((m) => m.characterId === characterId)?.categories.length ?? 0}
      onClose={ctx.onClose}
      onConfirm={() => {
        ctx.state.save(profile.id, { name: profile.name, document: removeMember(profile.document, characterId) });
        ctx.onClose();
      }}
    />
  );
}

const PROFILE_DIALOGS = {
  rename: RenameProfileDialog,
  duplicate: DuplicateProfileDialog,
  delete: DeleteDialog,
} as const;

/** The one open workspace dialog, if any. Every action but create needs a profile open. */
export function WorkspaceDialogs({
  dialog,
  profile,
  ctx,
}: {
  dialog: DialogState;
  profile: IndustryProfileRow | null;
  ctx: DialogContext;
}) {
  if (dialog === null) return null;
  if (dialog.kind === 'create') return <CreateProfileDialog ctx={ctx} />;
  if (profile === null) return null;
  if (dialog.kind === 'remove-member') {
    return <RemoveDialog ctx={ctx} profile={profile} characterId={dialog.characterId} />;
  }
  const Dialog = PROFILE_DIALOGS[dialog.kind];
  return <Dialog ctx={ctx} profile={profile} />;
}
