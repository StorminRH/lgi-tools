'use client';

import { useId, type ReactNode } from 'react';
import {
  CharacterPortraitPicker,
  type PickerCharacter,
  type PortraitToggleChange,
} from '@/components/character-portrait-picker';
import { eyebrow } from '@/components/ui/type-roles';

/** The caller's own characters on a map's access list, picked by portrait. */
export function OwnCharacterPicker({
  characters,
  selectedIds,
  onToggle,
  disabled,
  hint,
}: {
  readonly characters: readonly PickerCharacter[] | null;
  readonly selectedIds: ReadonlySet<number>;
  readonly onToggle: (change: PortraitToggleChange) => void;
  readonly disabled?: boolean;
  readonly hint: ReactNode;
}) {
  const hintId = useId();
  return (
    <section className="flex flex-col gap-2" data-own-character-picker aria-describedby={hintId}>
      <div className={eyebrow()}>Your characters</div>
      {characters === null ? (
        <span className="font-ui text-ui text-muted">Loading your characters…</span>
      ) : (
        <CharacterPortraitPicker
          label="Your characters"
          characters={characters}
          selectedIds={selectedIds}
          onToggle={onToggle}
          disabled={disabled}
        />
      )}
      <p id={hintId} className="font-ui text-label text-faint">{hint}</p>
    </section>
  );
}
