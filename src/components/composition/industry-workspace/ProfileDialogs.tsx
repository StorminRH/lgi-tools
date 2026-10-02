'use client';

import { type FormEvent, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogClose, DialogHeader } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MAX_PROFILE_NAME_LEN } from '@/features/industry-planner/profiles/profile-document';

export type NameDialogMode = 'create' | 'rename' | 'duplicate';

const NAME_DIALOG_COPY: Record<NameDialogMode, { title: string; action: string; description: string }> = {
  create: {
    title: 'New profile',
    action: 'Create profile',
    description: 'A profile is one way you run production: who is on the team and what each of them does.',
  },
  rename: { title: 'Rename profile', action: 'Rename', description: 'Only the name changes.' },
  duplicate: {
    title: 'Duplicate profile',
    action: 'Duplicate',
    description: 'The copy starts with the same members, responsibilities and facilities, then changes on its own.',
  },
};

/**
 * One dialog for naming a profile: creating one, renaming one, or naming a
 * copy. Creating can start with every linked character on the team.
 */
export function ProfileNameDialog({
  mode,
  initialName,
  rosterSize,
  busy,
  onSubmit,
  onClose,
}: {
  mode: NameDialogMode;
  initialName: string;
  rosterSize: number;
  busy: boolean;
  onSubmit: (name: string, includeRoster: boolean) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const [name, setName] = useState(initialName);
  const [includeRoster, setIncludeRoster] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const copy = NAME_DIALOG_COPY[mode];
  const trimmed = name.trim();

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
          if (trimmed !== '') onSubmit(trimmed, includeRoster);
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
          {mode === 'create' && rosterSize > 0 ? (
            <div className="flex items-center gap-2.5 text-ui text-text">
              <Checkbox
                checked={includeRoster}
                onCheckedChange={setIncludeRoster}
                label="Start with all linked characters"
              />
              <span aria-hidden>
                Start with all {rosterSize} linked {rosterSize === 1 ? 'character' : 'characters'}
              </span>
            </div>
          ) : null}
        </div>
        <footer className="flex items-center justify-end gap-2.5 border-t border-border-soft px-4 py-3">
          <DialogClose render={<Button variant="secondary" size="sm" />}>Cancel</DialogClose>
          <Button type="submit" variant="primary" size="sm" disabled={trimmed === '' || busy}>
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
  roleCount,
  onConfirm,
  onClose,
}: {
  name: string;
  roleCount: number;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Remove ${name} from this profile?`}
      consequence={
        roleCount > 0
          ? `Their ${roleCount === 1 ? 'responsibility' : `${roleCount} responsibilities`} on this profile go with them. Other profiles keep their own setup.`
          : 'Other profiles keep their own setup.'
      }
      busy={false}
      confirmLabel="Remove"
      onConfirm={onConfirm}
    />
  );
}
