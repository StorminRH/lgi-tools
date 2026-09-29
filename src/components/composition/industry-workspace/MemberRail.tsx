'use client';

import { CharacterPortrait } from '@/components/character-portrait';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Menu, MenuItem, menuRow, menuSeparator } from '@/components/ui/menu';
import { Pill } from '@/components/ui/pill';
import { RESPONSIBILITY_LABELS } from '@/features/industry-planner/profiles/responsibilities';
import { startCharacterLink } from '@/platform/auth/link-character';
import type { RailMember, RosterCharacter } from './workspace-model';

function roleLine(member: RailMember): string {
  return member.roles.length === 0
    ? 'No responsibilities'
    : member.roles.map((role) => RESPONSIBILITY_LABELS[role]).join(' · ');
}

function RailButton({
  member,
  selected,
  onSelect,
}: {
  member: RailMember;
  selected: boolean;
  onSelect: (characterId: number) => void;
}) {
  return (
    <Button
      variant="bare"
      aria-current={selected ? 'true' : undefined}
      aria-label={`${member.name}: ${roleLine(member)}${member.linked ? '' : ', not linked'}`}
      data-member-id={member.characterId}
      onClick={() => onSelect(member.characterId)}
      className={cn(
        'group relative w-16 shrink-0 flex-col gap-1.5 rounded-card text-center lg:w-full lg:flex-row lg:items-center lg:gap-3 lg:px-2 lg:py-2 lg:text-left',
        selected && 'lg:bg-row-on',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute -left-2 top-2 bottom-2 hidden w-0.5 rounded-full bg-isk lg:block',
          !selected && 'invisible',
        )}
      />
      <CharacterPortrait
        characterId={member.characterId}
        name={member.name}
        size={64}
        src={member.portraitUrl ?? undefined}
        className={cn(
          'size-12 transition-shadow duration-300 group-hover:shadow-cta-glow group-focus-visible:shadow-cta-glow lg:size-14',
          selected && 'ring-2 ring-isk ring-offset-2 ring-offset-bg-deep',
          !member.linked && 'opacity-50 grayscale',
        )}
      />
      <span className="flex w-full min-w-0 flex-col gap-1">
        <span
          className={cn(
            'truncate font-display font-bold leading-tight transition-colors group-hover:text-isk-bright max-lg:text-micro lg:text-nav',
            selected ? 'text-isk-bright' : 'text-name',
          )}
        >
          {member.name}
        </span>
        <span className="hidden min-w-0 truncate font-data text-micro text-muted lg:block">
          {roleLine(member)}
        </span>
        {!member.linked ? (
          <span className="hidden lg:block">
            <Pill tone="orange">Not linked</Pill>
          </span>
        ) : null}
      </span>
    </Button>
  );
}

function AddMember({
  addable,
  onAdd,
}: {
  addable: readonly RosterCharacter[];
  onAdd: (character: RosterCharacter) => void;
}) {
  return (
    <Menu
      label="Add a character to this profile"
      trigger={
        <>
          <span
            aria-hidden
            className="flex size-12 shrink-0 items-center justify-center rounded-full border border-dashed border-border-active text-h3 transition-colors group-hover:border-isk-sub lg:size-14"
          >
            +
          </span>
          <span className="max-lg:sr-only">Add character</span>
        </>
      }
      triggerClassName="group flex w-16 shrink-0 cursor-pointer flex-col items-center gap-1.5 rounded-card font-data text-ui text-muted outline-none transition-colors hover:text-isk focus-visible:text-isk lg:w-full lg:flex-row lg:gap-3 lg:px-2"
      className="flex min-w-60 flex-col rounded-card p-[5px]"
      surface="frosted"
      side="bottom"
      align="start"
      sideOffset={6}
    >
      {addable.map((character) => (
        <MenuItem
          key={character.characterId}
          closeOnClick
          className={cn(menuRow, 'rounded-ctl')}
          onClick={() => onAdd(character)}
        >
          <CharacterPortrait characterId={character.characterId} name={character.name} size={28} src={character.portraitUrl} />
          <span className="truncate">{character.name}</span>
        </MenuItem>
      ))}
      {addable.length > 0 ? <div className={cn(menuSeparator, 'my-1')} /> : null}
      <MenuItem
        closeOnClick
        className={cn(menuRow, 'rounded-ctl')}
        onClick={() => startCharacterLink('/industry')}
      >
        Link another EVE character…
      </MenuItem>
    </Menu>
  );
}

/**
 * The profile's members, portraits on the backdrop like the home board's
 * pilot rail. The selected member is marked by a ring, a bar and its name
 * colour, and announced as current. On phones the rail is a horizontal strip.
 */
export function MemberRail({
  members,
  selectedId,
  addable,
  onSelect,
  onAdd,
}: {
  members: readonly RailMember[];
  selectedId: number | null;
  addable: readonly RosterCharacter[];
  onSelect: (characterId: number) => void;
  onAdd: (character: RosterCharacter) => void;
}) {
  return (
    <nav
      aria-label="Profile members"
      className="-mx-4 flex min-w-0 gap-4 overflow-x-auto px-4 pb-2 sm:-mx-0 sm:px-0 lg:flex-col lg:gap-2 lg:overflow-visible lg:pb-0 lg:pl-2"
    >
      {members.map((member) => (
        <RailButton
          key={member.characterId}
          member={member}
          selected={member.characterId === selectedId}
          onSelect={onSelect}
        />
      ))}
      <AddMember addable={addable} onAdd={onAdd} />
    </nav>
  );
}
