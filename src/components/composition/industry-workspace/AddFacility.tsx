'use client';

import { type ReactNode, useEffect, useState } from 'react';
import * as Combobox from '@/components/ui/combobox';
import { SearchIcon } from '@/components/ui/icons';
import { loadStations, type StationSearchEntry } from '@/data/eve-data/stations-search';
import type { AvailableStructure } from '@/features/industry-planner/types';
import { type FacilityPick, facilityOptionGroups } from './facilities-model';

/** The station index, read the first time someone opens the list. */
function useStations(wanted: boolean): StationSearchEntry[] {
  const [stations, setStations] = useState<StationSearchEntry[]>([]);
  useEffect(() => {
    if (!wanted) return;
    let alive = true;
    loadStations()
      .then((loaded) => {
        if (alive) setStations(loaded);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [wanted]);
  return stations;
}

/**
 * Adds a facility to the profile. Opening it lists the account's saved and
 * corporation structures; typing narrows them and searches NPC stations by
 * name or system.
 */
export function AddFacility({
  structures,
  taken,
  describe,
  onAdd,
}: {
  structures: readonly AvailableStructure[] | null;
  taken: ReadonlySet<string>;
  describe: (pick: FacilityPick) => ReactNode;
  onAdd: (pick: FacilityPick) => void;
}) {
  const [query, setQuery] = useState('');
  const [opened, setOpened] = useState(false);
  const stations = useStations(opened || query !== '');
  const groups = facilityOptionGroups({ query, structures: structures ?? [], stations, taken });
  const options = new Map(groups.flatMap((g) => g.options.map((o) => [o.value, o] as const)));
  return (
    <Combobox.Root
      items={[...options.keys()]}
      value={query}
      onValueChange={(next, details) => {
        const picked = details.reason === 'item-press' ? options.get(next) : undefined;
        if (picked === undefined) {
          setQuery(next);
          return;
        }
        onAdd(picked.pick);
        setQuery('');
      }}
      onOpenChange={(open) => {
        if (open) setOpened(true);
      }}
      filter={null}
      mode="list"
      openOnInputClick
    >
      <Combobox.Field
        aria-label="Add a facility"
        placeholder="Add facility"
        disabled={structures === null}
        type="text"
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        prompt={<SearchIcon size={15} />}
      />
      {groups.length > 0 ? (
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
      ) : null}
    </Combobox.Root>
  );
}
