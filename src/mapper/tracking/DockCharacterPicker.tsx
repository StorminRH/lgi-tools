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
  'pointer-events-auto nopan -ml-0.5 flex max-w-full self-start cursor-pointer items-center gap-1.5 rounded-ctl px-0.5 py-0.5 font-data text-micro text-muted outline-none transition-colors hover:text-name focus-visible:text-name data-[popup-open]:text-name';

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
              className="flex size-icon-md shrink-0 items-center justify-center rounded-full border border-border-idle text-micro"
            >
              ?
            </span>
          ) : (
            <CharacterPortrait
              characterId={shownId}
              name={shown.name}
              src={shown.portraitUrl}
              size={18}
            />
          )}
          <span className="truncate">{label}</span>
          <span aria-hidden className="text-micro leading-none">
            ▾
          </span>
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
