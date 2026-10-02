'use client';

import { useState } from 'react';
import * as Combobox from '@/components/ui/combobox';
import { Kbd } from '@/components/ui/kbd';

const SYSTEM_GROUPS = [
  { name: 'Wormholes', systems: ['J115405', 'J104809', 'J160941'] },
  { name: 'Known space', systems: ['Jita', 'Perimeter', 'Amarr'] },
] as const;

export function SystemCombobox() {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const groups = SYSTEM_GROUPS.map((group) => ({
    name: group.name,
    systems: group.systems.filter((system) => system.toLowerCase().includes(needle)),
  })).filter((group) => group.systems.length > 0);

  return (
    <Combobox.Root
      items={groups.flatMap((group) => group.systems)}
      value={query}
      onValueChange={(next: string) => setQuery(next)}
      filter={null}
      mode="list"
    >
      <Combobox.Field
        aria-label="System"
        placeholder="Search systems…"
        trailing={<Kbd>↵</Kbd>}
      />
      <Combobox.Panel className="w-[var(--anchor-width)]">
        <Combobox.List>
          {groups.map((group) => (
            <Combobox.Group key={group.name}>
              <Combobox.GroupLabel>{group.name}</Combobox.GroupLabel>
              {group.systems.map((system) => (
                <Combobox.Item key={system} value={system} className="px-2.5 py-2 font-data text-ui text-text">
                  {system}
                </Combobox.Item>
              ))}
            </Combobox.Group>
          ))}
        </Combobox.List>
      </Combobox.Panel>
    </Combobox.Root>
  );
}
