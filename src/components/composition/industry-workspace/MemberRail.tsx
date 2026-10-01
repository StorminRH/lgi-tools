'use client';

import { ViewTransition } from 'react';
import { CharacterPortrait } from '@/components/character-portrait';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Menu, MenuItem, menuRow, menuSeparator } from '@/components/ui/menu';
import { Pill } from '@/components/ui/pill';
import { startCharacterLink } from '@/platform/auth/link-character';
import { pilotTransitionName } from '../board/board-motion';
import { type RailMember, roleLine, type RosterCharacter } from './workspace-model';


function RailButton({
  member,
  onSelect,
}: {
  member: RailMember;
  onSelect: (characterId: number) => void;
}) {
  return (
    <Button
      variant="bare"
      aria-label={`${member.name}: ${roleLine(member)}${member.linked ? '' : ', not linked'}`}
      data-member-id={member.characterId}
      onClick={() => onSelect(member.characterId)}
      className="group w-16 shrink-0 flex-col gap-1.5 rounded-card text-center lg:w-full lg:flex-row lg:items-start lg:gap-3 lg:text-left"
    >
      <ViewTransition name={pilotTransitionName(member.characterId)} share="morph" default="none">
        <CharacterPortrait
          characterId={member.characterId}
          name={member.name}
          size={64}
          src={member.portraitUrl ?? undefined}
          className={cn(
            'transition-shadow duration-300 group-hover:shadow-cta-glow group-focus-visible:shadow-cta-glow max-lg:size-12 lg:max-xl:size-14',
            !member.linked && 'opacity-50 grayscale',
          )}
        />
      </ViewTransition>
      <span className="flex w-full min-w-0 flex-col gap-1">
        <span className="truncate font-display font-bold leading-tight text-name transition-colors group-hover:text-isk-bright max-lg:text-micro lg:text-nav">
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
            className="flex size-12 shrink-0 items-center justify-center rounded-full border border-dashed border-border-active text-h3 transition-colors group-hover:border-isk-sub lg:size-14 xl:size-16"
          >
            +
          </span>
          <span className="max-lg:sr-only">Add character</span>
        </>
      }
      triggerClassName="group flex w-16 shrink-0 cursor-pointer flex-col items-center gap-1.5 rounded-card font-data text-ui text-muted outline-none transition-colors hover:text-isk focus-visible:text-isk lg:w-full lg:flex-row lg:gap-3"
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
 * The profile's members, frameless on the backdrop like the home board's
 * pilot rail: what each is responsible for, and a way to add another at the
 * end. Opening one morphs its portrait into the member's sheet. On phones it
 * becomes a horizontal strip of portraits that scrolls on its own.
 */
export function MemberRail({
  members,
  addable,
  onSelect,
  onAdd,
}: {
  members: readonly RailMember[];
  addable: readonly RosterCharacter[];
  onSelect: (characterId: number) => void;
  onAdd: (character: RosterCharacter) => void;
}) {
  return (
    <nav
      aria-label="Profile members"
      className="-mx-4 flex min-w-0 gap-4 overflow-x-auto px-4 pb-2 sm:-mx-0 sm:px-0 lg:flex-col lg:gap-5 lg:overflow-visible lg:pb-0"
    >
      {members.map((member) => (
        <RailButton key={member.characterId} member={member} onSelect={onSelect} />
      ))}
      <AddMember addable={addable} onAdd={onAdd} />
    </nav>
  );
}
