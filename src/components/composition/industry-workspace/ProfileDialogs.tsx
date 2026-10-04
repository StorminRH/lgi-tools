'use client';

import { type FormEvent, useId, useRef, useState } from 'react';
import {
  CharacterPortraitPicker,
  type PickerCharacter,
  toggleCharacterId,
} from '@/components/character-portrait-picker';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogClose, DialogHeader } from '@/components/ui/dialog';
import { Field, fieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MAX_PROFILE_NAME_LEN } from '@/features/industry-planner/profiles/profile-document';

export type NameDialogMode = 'create' | 'rename' | 'duplicate';

const NAME_DIALOG_COPY: Record<NameDialogMode, { title: string; action: string; description: string }> = {
  create: {
    title: 'New profile',
    action: 'Create profile',
    description: 'A profile is one way you run production: who is on the team, where they build, and what each of them builds.',
  },
  rename: { title: 'Rename profile', action: 'Rename', description: 'Only the name changes.' },
  duplicate: {
    title: 'Duplicate profile',
    action: 'Duplicate',
    description: 'The copy starts with the same members, facilities and categories, then changes on its own.',
  },
};

/** The linked characters a new profile starts with, picked by portrait. */
function TeamPicker({
  roster,
  selected,
  onChange,
}: {
  roster: readonly PickerCharacter[];
  selected: readonly number[];
  onChange: (next: readonly number[]) => void;
}) {
  const labelId = useId();
  const all = selected.length === roster.length;
  return (
    <section aria-labelledby={labelId} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span id={labelId} className={fieldLabel}>
          Characters
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="-my-1 -mr-2.5"
          onClick={() => onChange(all ? [] : roster.map((c) => c.characterId))}
        >
          {all ? 'Clear' : 'Select all'}
        </Button>
      </div>
      <CharacterPortraitPicker
        label="Characters"
        characters={roster}
        selectedIds={new Set(selected)}
        onToggle={(change) => onChange(toggleCharacterId(selected, change))}
      />
    </section>
  );
}

/**
 * One dialog for naming a profile: creating one, renaming one, or naming a
 * copy. Creating also picks which linked characters start on the team.
 */
export function ProfileNameDialog({
  mode,
  initialName,
  roster,
  busy,
  onSubmit,
  onClose,
}: {
  mode: NameDialogMode;
  initialName: string;
  roster: readonly PickerCharacter[];
  busy: boolean;
  onSubmit: (name: string, characterIds: readonly number[]) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const [name, setName] = useState(initialName);
  const [team, setTeam] = useState<readonly number[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const copy = NAME_DIALOG_COPY[mode];
  const trimmed = name.trim();
  const picking = mode === 'create' && roster.length > 0;
  const ready = trimmed !== '' && !(picking && team.length === 0);

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      labelledBy={titleId}
      initialFocus={inputRef}
      className="w-[min(28rem,calc(100vw-2rem))]"
    >
      <form
        className="flex flex-col"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          if (ready) onSubmit(trimmed, team);
        }}
      >
        <DialogHeader titleId={titleId} title={copy.title} description={copy.description} closeLabel="Close" />
        <div className="flex flex-col gap-4 px-4 py-4">
          <Field label="Profile name">
            <Input
              ref={inputRef}
              value={name}
              maxLength={MAX_PROFILE_NAME_LEN}
              autoComplete="off"
              placeholder="Capital production"
              onChange={(event) => setName(event.currentTarget.value)}
            />
          </Field>
          {picking ? <TeamPicker roster={roster} selected={team} onChange={setTeam} /> : null}
        </div>
        <footer className="flex items-center justify-end gap-2.5 border-t border-border-soft px-4 py-3">
          <DialogClose render={<Button variant="secondary" size="sm" />}>Cancel</DialogClose>
          <Button type="submit" variant="primary" size="sm" disabled={!ready || busy}>
            {copy.action}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}

export function DeleteProfileDialog({
  name,
  busy,
  onConfirm,
  onClose,
}: {
  name: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Delete ${name}?`}
      consequence="The profile leaves your list. Your characters, structures and saved templates are not changed."
      busy={busy}
      busyLabel="Deleting…"
      confirmLabel="Delete profile"
      onConfirm={onConfirm}
    />
  );
}

export function RemoveMemberDialog({
  name,
  categoryCount,
  onConfirm,
  onClose,
}: {
  name: string;
  categoryCount: number;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Remove ${name} from this profile?`}
      consequence={
        categoryCount > 0
          ? `Their ${categoryCount === 1 ? 'category' : `${categoryCount} categories`} on this profile go with them. Other profiles keep their own setup.`
          : 'Other profiles keep their own setup.'
      }
      busy={false}
      confirmLabel="Remove"
      onConfirm={onConfirm}
    />
  );
}
