'use client';

import { type ReactNode, useId, useRef, useState } from 'react';
import { TypeIcon } from '@/components/type-icon';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Menu, MenuGroup, MenuItem, menuRow, menuSeparator } from '@/components/ui/menu';
import type { AvailableStructure } from '@/features/industry-planner/types';
import { AddFacility, type FacilityScope } from './AddFacility';
import type { FacilityPick } from './facilities-model';
import { setStructuresPanelOpen } from './structures-panel';

/** The Engineering Complex the structure button wears, as the rows wear their hulls. */
const RAITARU_TYPE_ID = 35825;

/** The NPC station tile, shrunk to sit in a button. */
function StationTile() {
  return (
    <span
      aria-hidden
      className="grid h-5 min-w-5 place-items-center rounded-ctl border border-border-active px-0.5 font-display text-micro font-bold text-muted"
    >
      NPC
    </span>
  );
}

const PICKER_GROUPS = [
  { label: 'Corporation structures', source: 'corp' },
  { label: 'Your structures', source: 'custom' },
] as const;

/**
 * The account's structures not yet on the profile, then a new structure,
 * which joins the profile once saved, and the drawer that manages them all.
 */
function StructurePicker({
  structures,
  taken,
  describe,
  onAdd,
  onNewStructure,
  full,
}: {
  structures: readonly AvailableStructure[] | null;
  taken: ReadonlySet<string>;
  describe: (pick: FacilityPick) => ReactNode;
  onAdd: (pick: FacilityPick) => void;
  onNewStructure: () => void;
  full: boolean;
}) {
  const open = (structures ?? []).filter((s) => !taken.has(`structure:${s.id}`));
  return (
    <Menu
      label="Add a structure"
      trigger={
        <>
          <TypeIcon typeId={RAITARU_TYPE_ID} size={22} mono="Ra" />
          Structure
        </>
      }
      triggerClassName={cn(buttonVariants({ size: 'sm' }), 'gap-1.5')}
      triggerProps={{ 'data-structures-trigger': '' }}
      className="flex max-h-[360px] min-w-64 flex-col overflow-y-auto rounded-card p-[5px]"
      surface="frosted"
      side="bottom"
      align="end"
      sideOffset={6}
    >
      {PICKER_GROUPS.map(({ label, source }) => {
        const group = open.filter((s) => s.source === source);
        return group.length > 0 ? (
          <MenuGroup key={source} label={label}>
            {group.map((structure) => (
              <MenuItem
                key={structure.id}
                closeOnClick
                disabled={full}
                className={cn(menuRow, 'flex-col items-start gap-0.5 rounded-ctl')}
                onClick={() => onAdd({ kind: 'structure', structure })}
              >
                <span className="max-w-full truncate text-name">{structure.name}</span>
                {describe({ kind: 'structure', structure })}
              </MenuItem>
            ))}
          </MenuGroup>
        ) : null;
      })}
      {open.length > 0 ? <div className={cn(menuSeparator, 'my-1')} /> : null}
      <MenuItem closeOnClick disabled={full} className={cn(menuRow, 'rounded-ctl')} onClick={onNewStructure}>
        New structure…
      </MenuItem>
      <MenuItem closeOnClick className={cn(menuRow, 'rounded-ctl')} onClick={() => setStructuresPanelOpen(true)}>
        Manage structures…
      </MenuItem>
    </Menu>
  );
}

/**
 * The foot of the facility list, set like one more row: a search across
 * everything, then a structure picker and an NPC station search.
 */
export function AddFacilityRow({
  structures,
  taken,
  describe,
  onAdd,
  onNewStructure,
  full,
}: {
  structures: readonly AvailableStructure[] | null;
  taken: ReadonlySet<string>;
  describe: (pick: FacilityPick) => ReactNode;
  onAdd: (pick: FacilityPick) => void;
  onNewStructure: () => void;
  full: boolean;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [scope, setScope] = useState<FacilityScope>('all');
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-3">
      <label
        htmlFor={inputId}
        aria-hidden
        className="grid size-10 shrink-0 cursor-text place-items-center rounded-ctl border border-dashed border-border-active text-h3 text-muted"
      >
        +
      </label>
      <div className="min-w-40 flex-1">
        <AddFacility
          structures={structures}
          taken={taken}
          describe={describe}
          onAdd={onAdd}
          full={full}
          scope={scope}
          onScopeEnd={() => setScope('all')}
          inputRef={inputRef}
          prompt={null}
          // Plain text in the row until focused, when it shows as the field it is.
          className="-ml-2 rounded-full px-3 not-focus-within:border-transparent not-focus-within:bg-transparent not-focus-within:shadow-none not-focus-within:backdrop-blur-none"
          id={inputId}
        />
      </div>
      <div className="flex shrink-0 gap-2 max-sm:w-full max-sm:pl-[3.25rem]">
        <StructurePicker
          structures={structures}
          taken={taken}
          describe={describe}
          onAdd={onAdd}
          onNewStructure={onNewStructure}
          full={full}
        />
        <Button
          size="sm"
          className="gap-1.5"
          disabled={structures === null || full}
          onClick={() => {
            setScope('stations');
            inputRef.current?.focus();
          }}
        >
          <StationTile />
          Station
        </Button>
      </div>
    </div>
  );
}
