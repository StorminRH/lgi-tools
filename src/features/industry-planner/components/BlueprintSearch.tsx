'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import * as Combobox from '@/components/ui/combobox';
import { SearchIcon } from '@/components/ui/icons';
import { TypeIcon } from '@/components/type-icon';
import { searchOneSource, type SearchResult } from '@/platform/search';
import { useSourceSearch } from '@/platform/search/use-source-search';

const SEARCH_DEBOUNCE_MS = 150;

const searchBlueprints = (query: string, signal: AbortSignal) => searchOneSource(query, 'blueprints', signal);

/** Finds a blueprint and opens it in the planner. */
export function BlueprintSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const found = useSourceSearch(query.trim(), searchBlueprints, SEARCH_DEBOUNCE_MS);
  const hits = query.trim() === '' ? [] : found;
  const open = (hit: SearchResult) => router.push(hit.href, { transitionTypes: ['industry-tab'] });
  return (
    <Combobox.Root
      items={hits.map((hit) => hit.id)}
      value={query}
      onValueChange={(next, details) => {
        const picked = details.reason === 'item-press' ? hits.find((hit) => hit.id === next) : undefined;
        if (picked) open(picked);
        else setQuery(next);
      }}
      filter={null}
      mode="list"
    >
      <Combobox.Field
        aria-label="Search for a blueprint"
        placeholder="Search for a blueprint"
        type="text"
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        prompt={<SearchIcon size={18} />}
        className="w-full py-3"
      />
      {hits.length > 0 ? (
        <Combobox.Panel className="w-[var(--anchor-width)] p-1" sideOffset={8}>
          <Combobox.List>
            {hits.map((hit) => (
              <Combobox.Item key={hit.id} value={hit.id} className="flex w-full items-center gap-3 px-2.5 py-2">
                {hit.icon ? <TypeIcon {...hit.icon} size={32} mono={hit.label.slice(0, 2)} /> : null}
                <span className="min-w-0 flex-1 truncate font-ui text-nav text-name">{hit.label}</span>
              </Combobox.Item>
            ))}
          </Combobox.List>
        </Combobox.Panel>
      ) : null}
    </Combobox.Root>
  );
}
