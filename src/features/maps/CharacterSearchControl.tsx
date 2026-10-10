'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CharacterPortrait } from '@/components/character-portrait';
import * as Combobox from '@/components/ui/combobox';
import { pickOrType } from '@/components/ui/combobox-pick';
import {
  MAX_CHARACTER_SEARCH_LENGTH,
  MIN_CHARACTER_SEARCH_LENGTH,
  searchCharactersEndpoint,
  type SearchCharactersResponse,
} from '@/data/maps/api-contract';
import { apiFetch } from '@/transport/api-client';
import type { OutcomeOf } from '@/transport/endpoint';
import {
  accessPrincipalKey,
  characterSearchPopupOpen,
  type AccessPrincipalOption,
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

function characterSearchState(outcome: CharacterSearchOutcome): {
  readonly failed: boolean;
  readonly mode: SearchCharactersResponse['mode'] | null;
  readonly results: CharacterSearchResult[];
} {
  if (!outcome.ok) return { failed: true, mode: null, results: [] };
  return {
    failed: false,
    mode: outcome.data.mode,
    results: outcome.data.results,
  };
}

function useCharacterSearch(selectedKeys: ReadonlySet<string>) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CharacterSearchResult[]>([]);
  const [mode, setMode] = useState<SearchCharactersResponse['mode'] | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const search = normalizedQuery(query);
  const latestSearchRef = useRef(search);

  function changeQuery(next: string) {
    latestSearchRef.current = normalizedQuery(next);
    setQuery(next);
    setResults([]);
    setMode(null);
    setBusy(false);
    setFailed(false);
    setPopupOpen(false);
  }

  useEffect(() => {
    if (search.length < MIN_CHARACTER_SEARCH_LENGTH) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setBusy(true);
      setFailed(false);
      void apiFetch(searchCharactersEndpoint, {
        body: { search },
        cache: 'no-store',
        signal: controller.signal,
      }).then((outcome) => {
        if (controller.signal.aborted || latestSearchRef.current !== search) return;
        const next = characterSearchState(outcome);
        setBusy(false);
        setFailed(next.failed);
        setResults(next.results);
        setMode(next.mode);
        setPopupOpen(next.results.length > 0);
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  const available = useMemo(
    () =>
      results.filter(
        (result) =>
          !selectedKeys.has(
            accessPrincipalKey({ ownerType: 'character', ownerId: result.characterId }),
          ),
      ),
    [results, selectedKeys],
  );
  return {
    available,
    busy,
    changeQuery,
    hint: characterSearchHint({ failed, mode, searchLength: search.length }),
    hintFailed: failed,
    open: characterSearchPopupOpen(popupOpen, available.length),
    query,
    setPopupOpen,
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
  const {
    available,
    busy,
    changeQuery,
    hint,
    hintFailed,
    open,
    query,
    setPopupOpen,
  } = useCharacterSearch(selectedKeys);
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
            onType: changeQuery,
            onPick: (result) => {
              onSelect(principalFromCharacter(result));
              changeQuery('');
            },
          })
        }
        filter={null}
        open={open}
        onOpenChange={(next) => setPopupOpen(next)}
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
