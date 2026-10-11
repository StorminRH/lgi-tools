'use client';

import { CharacterPortrait } from '@/components/character-portrait';
import { cn } from '@/components/ui/cn';
import { Menu, MenuItem, menuRow, menuSeparator } from '@/components/ui/menu';
import { Pill } from '@/components/ui/pill';
import { startCharacterLink } from '@/platform/auth/link-character';
import { PortraitRail, RailAddDisc, railAddTrigger, RailEntry } from '../board/focus-rail';
import { type RailMember, roleLine, type RosterCharacter } from './workspace-model';

function RailButton({
  member,
  onSelect,
}: {
  member: RailMember;
  onSelect: (characterId: number) => void;
}) {
  return (
    <RailEntry
      characterId={member.characterId}
      name={member.name}
      portraitUrl={member.portraitUrl ?? undefined}
      dimmed={!member.linked}
      tileAttribute="data-member-id"
      ariaLabel={`${member.name}: ${roleLine(member)}${member.linked ? '' : ', not linked'}`}
      onSelect={onSelect}
    >
      <span className="hidden min-w-0 truncate font-data text-micro text-muted lg:block">{roleLine(member)}</span>
      {!member.linked ? (
        <span className="hidden lg:block">
          <Pill tone="orange">Not linked</Pill>
        </span>
      ) : null}
    </RailEntry>
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
      trigger={<RailAddDisc />}
      triggerClassName={railAddTrigger}
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
    <PortraitRail label="Profile members">
      {members.map((member) => (
        <RailButton key={member.characterId} member={member} onSelect={onSelect} />
      ))}
      <AddMember addable={addable} onAdd={onAdd} />
    </PortraitRail>
  );
}
