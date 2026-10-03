'use client';

import { CharacterPortrait } from './character-portrait';
import { MenuCheckboxItem } from './ui/menu';
import {
  PortraitToggle,
  PortraitToggleGroup,
  portraitToggleClass,
  portraitToggleRowClass,
} from './ui/portrait-toggle';

export interface PickerCharacter {
  readonly characterId: number;
  readonly name: string;
  readonly portraitUrl?: string;
  readonly needsLocationReconnect?: boolean;
}

export interface PortraitToggleChange {
  readonly characterId: number;
  readonly selected: boolean;
}

/** The single portrait a toggle-group change flipped, or null when nothing changed. */
function portraitToggleChange(
  selectedIds: ReadonlySet<number>,
  nextValues: readonly string[],
): PortraitToggleChange | null {
  const next = new Set(nextValues.map(Number));
  for (const characterId of next) {
    if (!selectedIds.has(characterId)) return { characterId, selected: true };
  }
  for (const characterId of selectedIds) {
    if (!next.has(characterId)) return { characterId, selected: false };
  }
  return null;
}

function Portrait({ character }: { readonly character: PickerCharacter }) {
  return (
    <CharacterPortrait
      characterId={character.characterId}
      name={character.name}
      size={32}
      src={character.portraitUrl}
      className="block"
    />
  );
}

/** Form-context portrait multi-select: one pressed toggle per chosen character. */
export function CharacterPortraitPicker({
  characters,
  selectedIds,
  onToggle,
  label,
  disabled,
}: {
  readonly characters: readonly PickerCharacter[];
  readonly selectedIds: ReadonlySet<number>;
  readonly onToggle: (change: PortraitToggleChange) => void;
  readonly label: string;
  readonly disabled?: boolean;
}) {
  const visibleSelectedIds = new Set(characters
    .filter((character) => selectedIds.has(character.characterId))
    .map((character) => character.characterId));
  return (
    <PortraitToggleGroup
      label={label}
      disabled={disabled}
      value={[...visibleSelectedIds].map(String)}
      onValueChange={(next) => {
        const change = portraitToggleChange(visibleSelectedIds, next);
        if (change !== null) onToggle(change);
      }}
    >
      {characters.map((character) => (
        <PortraitToggle
          key={character.characterId}
          value={String(character.characterId)}
          label={character.name}
        >
          <Portrait character={character} />
        </PortraitToggle>
      ))}
    </PortraitToggleGroup>
  );
}

/** Menu-context portrait multi-select; each portrait is a checkbox item that keeps the menu open. */
export function CharacterPortraitMenuItems({
  characters,
  checkedIds,
  onToggle,
  itemLabel,
  className,
}: {
  readonly characters: readonly PickerCharacter[];
  readonly checkedIds: ReadonlySet<number>;
  readonly onToggle: (change: PortraitToggleChange) => void;
  readonly itemLabel: (character: PickerCharacter, checked: boolean) => string;
  readonly className?: string;
}) {
  return (
    <div className={className ?? portraitToggleRowClass}>
      {characters.map((character) => {
        const checked = checkedIds.has(character.characterId);
        return (
          <MenuCheckboxItem
            key={character.characterId}
            checked={checked}
            onCheckedChange={(selected) => {
              onToggle({ characterId: character.characterId, selected });
            }}
            closeOnClick={false}
            label={character.name}
            aria-label={itemLabel(character, checked)}
            data-tracking-character-id={character.characterId}
            data-tracking-reconnect={character.needsLocationReconnect === true ? 'true' : undefined}
            className={portraitToggleClass}
          >
            <Portrait character={character} />
          </MenuCheckboxItem>
        );
      })}
    </div>
  );
}
