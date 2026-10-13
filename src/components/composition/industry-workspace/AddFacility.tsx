'use client';

import { type ReactNode, type Ref, useState } from 'react';
import * as Combobox from '@/components/ui/combobox';
import { pickOrType } from '@/components/ui/combobox-pick';
import { SearchIcon } from '@/components/ui/icons';
import { stationsResource, type StationSearchEntry } from '@/data/eve-data/stations-search';
import type { AvailableStructure } from '@/features/industry-planner/types';
import { useClientResource } from '@/lib/client-resource';
import { type FacilityOptionGroup, type FacilityPick, facilityOptionGroups } from './facilities-model';

function addPlaceholder(full: boolean, stationsOnly: boolean): string {
  if (full) return 'Facility limit reached';
  return stationsOnly ? 'NPC station or system' : 'Add a facility';
}

/** The open list: each group of facilities under its label, nothing while none match. */
function FacilityOptions({
  groups,
  describe,
}: {
  groups: readonly FacilityOptionGroup[];
  describe: (pick: FacilityPick) => ReactNode;
}) {
  if (groups.length === 0) return null;
  return (
    <Combobox.Panel className="max-h-[320px] w-[var(--anchor-width)] overflow-y-auto" sideOffset={6}>
      <Combobox.List>
        {groups.map((group) => (
          <Combobox.Group key={group.label}>
            <Combobox.GroupLabel>{group.label}</Combobox.GroupLabel>
            {group.options.map((option) => (
              <Combobox.Item
                key={option.value}
                value={option.value}
                className="flex w-full min-w-0 flex-col items-start gap-0.5 px-3 py-1.5"
              >
                <span className="max-w-full truncate font-ui text-ui text-name">{option.label}</span>
                {describe(option.pick)}
              </Combobox.Item>
            ))}
          </Combobox.Group>
        ))}
      </Combobox.List>
    </Combobox.Panel>
  );
}

const NO_STATIONS: readonly StationSearchEntry[] = [];

/** The station index, read the first time someone opens the list, types in it or scopes it to stations. */
function useStations(wanted: boolean): readonly StationSearchEntry[] {
  return useClientResource(stationsResource, wanted).value ?? NO_STATIONS;
}

/** Where the add-facility search looks: everywhere, or NPC stations only. */
export type FacilityScope = 'all' | 'stations';

/**
 * Adds a facility to the profile. Opening it lists the account's saved and
 * corporation structures; typing narrows them and searches NPC stations by
 * name or system. Scoped to stations, it searches those alone.
 */
export function AddFacility({
  structures,
  taken,
  describe,
  onAdd,
  full = false,
  scope = 'all',
  onScopeEnd,
  inputRef,
  prompt = <SearchIcon size={15} />,
  className,
  id,
}: {
  structures: readonly AvailableStructure[] | null;
  taken: ReadonlySet<string>;
  describe: (pick: FacilityPick) => ReactNode;
  onAdd: (pick: FacilityPick) => void;
  /** The profile holds as many facilities as it can. */
  full?: boolean;
  scope?: FacilityScope;
  /** The scoped search was used or left empty. */
  onScopeEnd?: () => void;
  inputRef?: Ref<HTMLInputElement>;
  prompt?: ReactNode;
  className?: string;
  id?: string;
}) {
  const [query, setQuery] = useState('');
  const [opened, setOpened] = useState(false);
  const stationsOnly = scope === 'stations';
  const stations = useStations(opened || query !== '' || stationsOnly);
  const groups = facilityOptionGroups({ query, structures: stationsOnly ? [] : (structures ?? []), stations, taken });
  const options = new Map(groups.flatMap((g) => g.options.map((o) => [o.value, o] as const)));
  return (
    <Combobox.Root
      items={[...options.keys()]}
      value={query}
      onValueChange={(next, details) =>
        pickOrType(next, details, {
          lookup: (value) => options.get(value),
          onType: setQuery,
          onPick: (picked) => {
            onAdd(picked.pick);
            setQuery('');
            onScopeEnd?.();
          },
        })
      }
      onOpenChange={(open) => {
        if (open) setOpened(true);
      }}
      filter={null}
      openOnInputClick
    >
      <Combobox.Field
        ref={inputRef}
        id={id}
        aria-label={stationsOnly ? 'Add an NPC station' : 'Add a facility'}
        placeholder={addPlaceholder(full, stationsOnly)}
        disabled={structures === null || full}
        onBlur={() => {
          if (query === '') onScopeEnd?.();
        }}
        className={className}
        type="text"
        prompt={prompt}
      />
      <FacilityOptions groups={groups} describe={describe} />
    </Combobox.Root>
  );
}
