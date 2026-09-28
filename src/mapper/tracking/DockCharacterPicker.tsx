'use client';

import { CharacterPortrait } from '@/components/character-portrait';
import { cn } from '@/components/ui/cn';
import {
  Menu,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRadioItemIndicator,
  MenuSeparator,
  menuRow,
  menuSeparator,
} from '@/components/ui/menu';
import { useSystemLabel } from '../windows/use-system-label';
import {
  useCharacterIdentities,
  type CharacterIdentity,
} from './use-character-identities';
import {
  DOCK_AUTO_VALUE,
  dockCharacterLabel,
  type DockCharacter,
} from './tracked-system';
import type { DockCharacterSelection } from './use-tracked-system';

const TRIGGER_CLASS =
  'pointer-events-auto nopan relative flex shrink-0 cursor-pointer items-center rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:ring-1 focus-visible:ring-isk data-[popup-open]:ring-1 data-[popup-open]:ring-isk';

/** Marks a pinned dock character, like a status dot on the portrait. */
const PINNED_BADGE = (
  <span
    aria-hidden
    data-dock-pinned-badge
    className="absolute -bottom-0.5 -right-1 flex size-[11px] items-center justify-center rounded-full border border-border-idle bg-bg-deep text-name"
  >
    <svg viewBox="0 0 16 16" fill="currentColor" className="size-[7px]">
      <path fillRule="evenodd" d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2H13v8H3V7Zm2 0h3V5a1.5 1.5 0 0 0-3 0Z" />
    </svg>
  </span>
);

const INDICATOR = (
  <MenuRadioItemIndicator className="ml-auto pl-2 text-micro leading-none text-muted">
    ✓
  </MenuRadioItemIndicator>
);

function CharacterItem({
  character,
  identity,
}: {
  readonly character: DockCharacter;
  readonly identity: CharacterIdentity;
}) {
  const systemName = useSystemLabel(character.systemId)?.name;
  return (
    <MenuRadioItem value={character.characterId} closeOnClick className={menuRow}>
      <CharacterPortrait
        characterId={character.characterId}
        name={identity.name}
        src={identity.portraitUrl}
        size={28}
        className={cn(character.systemId === null && 'opacity-50')}
      />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-name">{identity.name}</span>
        <span className="truncate font-data text-micro text-faint">
          {character.systemId === null ? 'Offline' : (systemName ?? String(character.systemId))}
        </span>
      </span>
      {INDICATOR}
    </MenuRadioItem>
  );
}

/**
 * Chooses the character the current-system dock follows. Auto tracks the
 * character that jumped most recently; a pinned character holds the dock.
 */
export function DockCharacterPicker({
  selection,
}: {
  readonly selection: DockCharacterSelection;
}) {
  const identityOf = useCharacterIdentities(
    selection.characters.map((character) => character.characterId),
  );
  if (selection.characters.length === 0) return null;

  const shownId = selection.target.kind === 'ready' ? selection.target.characterId : null;
  const shown = shownId === null ? null : identityOf(shownId);
  const label = dockCharacterLabel(selection, (id) => identityOf(id).name);
  const autoDetail = selection.mode === 'auto' && shown !== null ? shown.name : null;

  return (
    <Menu
      label={`Current system follows ${label}. Choose character`}
      trigger={
        <>
          {shown === null || shownId === null ? (
            <span
              aria-hidden
              className="flex size-5 items-center justify-center rounded-full border border-border-idle font-data text-micro text-muted"
            >
              ?
            </span>
          ) : (
            <CharacterPortrait
              characterId={shownId}
              name={shown.name}
              src={shown.portraitUrl}
              size={20}
            />
          )}
          {selection.mode === 'pinned' ? PINNED_BADGE : null}
        </>
      }
      triggerProps={{ 'data-dock-character-picker': selection.mode }}
      triggerClassName={TRIGGER_CLASS}
      className="min-w-60"
      align="start"
      sideOffset={4}
    >
      <MenuRadioGroup
        value={selection.pinnedCharacterId ?? DOCK_AUTO_VALUE}
        onValueChange={(value) => {
          const id = value as number;
          selection.pin(id === DOCK_AUTO_VALUE ? null : id);
        }}
      >
        <MenuRadioItem value={DOCK_AUTO_VALUE} closeOnClick className={menuRow}>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-name">
              Auto{autoDetail === null ? '' : ` (${autoDetail})`}
            </span>
            <span className="truncate font-data text-micro text-faint">
              Follows the last character to jump
            </span>
          </span>
          {INDICATOR}
        </MenuRadioItem>
        <MenuSeparator className={menuSeparator} />
        {selection.characters.map((character) => (
          <CharacterItem
            key={character.characterId}
            character={character}
            identity={identityOf(character.characterId)}
          />
        ))}
      </MenuRadioGroup>
    </Menu>
  );
}
