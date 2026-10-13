'use client';

import { useId, useMemo, useState } from 'react';
import { CharacterPortrait } from '@/components/character-portrait';
import * as Combobox from '@/components/ui/combobox';
import { pickOrType } from '@/components/ui/combobox-pick';
import {
  MAX_CHARACTER_SEARCH_LENGTH,
  MIN_CHARACTER_SEARCH_LENGTH,
  searchCharactersEndpoint,
  type SearchCharactersResponse,
} from '@/data/maps/api-contract';
import { useSearchAnswer } from '@/platform/search/use-source-search';
import { apiFetch } from '@/transport/api-client';
import type { OutcomeOf } from '@/transport/endpoint';
import {
  accessPrincipalKey,
  characterSearchPopupOpen,
  characterSearchView,
  type AccessPrincipalOption,
  type CharacterSearchState,
} from './access-editor-model';

type CharacterSearchResult = SearchCharactersResponse['results'][number];
type CharacterSearchOutcome = OutcomeOf<typeof searchCharactersEndpoint>;

const SEARCH_DEBOUNCE_MS = 300;

function normalizedQuery(query: string): string {
  return query.trim().slice(0, MAX_CHARACTER_SEARCH_LENGTH);
}

function principalFromCharacter(result: CharacterSearchResult): AccessPrincipalOption {
  return {
    ownerType: 'character',
    ownerId: result.characterId,
    name: result.name,
    imageUrl: result.portraitUrl,
  };
}

function characterSearchHint({
  failed,
  mode,
  searchLength,
}: {
  readonly failed: boolean;
  readonly mode: SearchCharactersResponse['mode'] | null;
  readonly searchLength: number;
}): string {
  if (failed) return 'Character search is temporarily unavailable.';
  if (mode === 'exact') return 'Exact-name mode — enter the full character name.';
  if (searchLength > 0 && searchLength < MIN_CHARACTER_SEARCH_LENGTH) {
    return `Enter at least ${MIN_CHARACTER_SEARCH_LENGTH} characters.`;
  }
  return 'Search by character name.';
}

function characterSearchState(outcome: CharacterSearchOutcome): CharacterSearchState {
  if (!outcome.ok) return { failed: true, mode: null, results: [] };
  return {
    failed: false,
    mode: outcome.data.mode,
    results: outcome.data.results,
  };
}

/** The search for a normalized query; a query too short to send answers null without a request. */
async function searchCharacters(
  search: string,
  signal: AbortSignal,
): Promise<CharacterSearchState | null> {
  if (search.length < MIN_CHARACTER_SEARCH_LENGTH) return null;
  return characterSearchState(
    await apiFetch(searchCharactersEndpoint, { body: { search }, cache: 'no-store', signal }),
  );
}

function useCharacterSearch(selectedKeys: ReadonlySet<string>) {
  const [query, setQuery] = useState('');
  // The search the popup was last closed on: it stays closed until the search changes or the field asks to open.
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const search = normalizedQuery(query);
  const answer = useSearchAnswer(search, searchCharacters, SEARCH_DEBOUNCE_MS);
  const { busy, failed, mode, results } = characterSearchView(search, answer);

  const available = results.filter(
    (result) =>
      !selectedKeys.has(accessPrincipalKey({ ownerType: 'character', ownerId: result.characterId })),
  );
  return {
    available,
    busy,
    hint: characterSearchHint({ failed, mode, searchLength: search.length }),
    hintFailed: failed,
    open: characterSearchPopupOpen(dismissedFor !== search, available.length),
    query,
    setOpen: (next: boolean) => setDismissedFor(next ? null : search),
    setQuery,
  };
}

export function CharacterSearchControl({
  disabled = false,
  label = 'Add character',
  selectedPrincipals,
  onSelect,
}: {
  readonly disabled?: boolean;
  readonly label?: string;
  readonly selectedPrincipals: readonly Pick<
    AccessPrincipalOption,
    'ownerType' | 'ownerId'
  >[];
  readonly onSelect: (principal: AccessPrincipalOption) => void;
}) {
  const selectedKeys = useMemo(
    () => new Set(selectedPrincipals.map(accessPrincipalKey)),
    [selectedPrincipals],
  );
  const { available, busy, hint, hintFailed, open, query, setOpen, setQuery } =
    useCharacterSearch(selectedKeys);
  const inputId = useId();
  const hintId = useId();
  // Items are character ids. A pick goes to onSelect and clears the field, so neither the id nor the name lands there.
  const byId = new Map(available.map((result) => [String(result.characterId), result]));

  return (
    <div className="flex flex-col gap-1.5" data-map-character-search>
      <label htmlFor={inputId} className="font-ui text-label tracking-label uppercase text-muted">
        {label}
      </label>
      <Combobox.Root
        items={[...byId.keys()]}
        value={query}
        onValueChange={(next, details) =>
          pickOrType(next, details, {
            lookup: (id) => byId.get(id),
            onType: setQuery,
            onPick: (result) => {
              onSelect(principalFromCharacter(result));
              setQuery('');
            },
          })
        }
        filter={null}
        open={open}
        onOpenChange={setOpen}
      >
        <Combobox.Field
          id={inputId}
          aria-describedby={hintId}
          placeholder="Character name"
          disabled={disabled}
          trailing={
            busy ? (
              <span className="font-ui text-label text-muted">Searching…</span>
            ) : null
          }
        />
        {open ? (
          <Combobox.Panel className="max-h-64 w-[var(--anchor-width)] overflow-y-auto">
            <Combobox.List>
              {available.map((result) => (
                <Combobox.Item
                  key={result.characterId}
                  value={String(result.characterId)}
                  className="flex w-full items-center gap-2 px-2.5 py-2"
                >
                  <CharacterPortrait
                    characterId={result.characterId}
                    name={result.name}
                    size={32}
                    src={result.portraitUrl}
                  />
                  <span className="min-w-0 flex-1 truncate font-ui text-ui text-text">
                    {result.name}
                  </span>
                </Combobox.Item>
              ))}
            </Combobox.List>
          </Combobox.Panel>
        ) : null}
      </Combobox.Root>
      <span
        id={hintId}
        className={
          hintFailed
            ? 'font-ui text-label text-tone-red'
            : 'font-ui text-label text-faint'
        }
      >
        {hint}
      </span>
    </div>
  );
}
