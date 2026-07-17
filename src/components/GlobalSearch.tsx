'use client';

// The in-nav global search component. Spotlight-style cross-source navigator
// that consumes the registry in `src/search/`, now built on the shared Combobox
// primitive (Base UI Autocomplete) — so the listbox, roving highlight,
// aria-activedescendant, Esc + outside-press dismiss are the library's, not
// hand-rolled. This component keeps only what Base UI can't own:
//
//   - the global ⌘K shortcut that focuses the input from anywhere
//   - the debounced dispatch into the search engine, with an AbortController per
//     query so a fast typist's earlier in-flight searches don't overwrite newer
//     results when the future Blueprints source's `await import()` lands
//   - recording rows into localStorage for the Recent source
//   - dispatching `onSelect(router)` for side-effectful rows (Log out, Log in)
//     instead of router-pushing their href
//   - the grouped, grid-laid-out rich rows with match highlighting
//
// The Sites source's data is seeded once on mount via setSiteSearchIndex.

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { searchAll, type SearchResult, type SearchSection } from '@/search';
import { setSiteSearchIndex } from '@/features/wormhole-sites/search';
import type { SiteSearchEntry } from '@/features/wormhole-sites/queries';
import { readRecents, pushRecent } from '@/features/search-recents/storage';
import { useAuth } from '@/features/auth/components/AuthProvider';
import { cn } from '@/components/ui/cn';
import { TypeIcon } from '@/components/type-icon';
import * as Combobox from '@/components/ui/combobox';
import { Kbd } from '@/components/ui/kbd';
import { flattenSections, searchIconClass, splitMatchRuns } from './global-search-view';

type Props = {
  active: boolean;
  onActiveChange: (active: boolean) => void;
  siteIndex: SiteSearchEntry[];
};

const DEBOUNCE_MS = 120;

/**
 * Renders the controlled global-search overlay, debounces queries by 120 milliseconds, and returns
 * navigation choices without owning route changes.
 */
export function GlobalSearch({ active, onActiveChange, siteIndex }: Props) {
  const { session, isAdmin } = useAuth();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sections, setSections] = useState<SearchSection[]>([]);
  const [recents, setRecents] = useState<SearchResult[]>([]);

  // Seed the Sites source's data once. Subsequent rerenders don't re-set.
  useEffect(() => {
    setSiteSearchIndex(siteIndex);
  }, [siteIndex]);

  // Read localStorage Recents on mount; SSR-safe because the read is inside
  // useEffect. readRecents() returns a fresh array each call, so useSyncExternalStore
  // would loop on the snapshot identity check — this one-shot setState is lighter.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecents(readRecents());
  }, []);

  // Debounce the query so fast typing doesn't run searchAll on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [value]);

  // Dispatch the debounced query. Each run gets its own AbortController so the
  // lazy-loaded Blueprints source can cancel its `await import()` follow-up when
  // the user keeps typing. AbortError is the expected cleanup signal — swallow it.
  useEffect(() => {
    const controller = new AbortController();
    searchAll(debounced, { session, isAdmin, recents, signal: controller.signal })
      .then((next) => {
        if (controller.signal.aborted) return;
        setSections(next);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        throw err;
      });
    return () => {
      controller.abort();
    };
  }, [debounced, session, isAdmin, recents]);

  // Global ⌘K (Ctrl-K on Win/Linux) focuses the input from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const items = useMemo(() => flattenSections(sections), [sections]);
  const hasResults = sections.length > 0;
  // The popup is visible only when the input is active AND there are results —
  // an active-but-empty input stays expanded with no dropdown (as before).
  const open = active && hasResults;

  function fireResult(result: SearchResult) {
    if (result.disabled) return;
    pushRecent(result);
    setRecents(readRecents());
    setValue('');
    onActiveChange(false);
    inputRef.current?.blur();
    if (result.onSelect) {
      result.onSelect(router);
      return;
    }
    router.push(result.href);
  }

  // Mirror the old dismiss: clear the query, collapse, and blur. Fired when Base UI
  // requests a close (Escape, outside-press) — replacing the hand-rolled listeners.
  const dismiss = () => {
    setValue('');
    inputRef.current?.blur();
    onActiveChange(false);
  };

  return (
    <div className="nav-host flex items-stretch">
      <Combobox.Root
        items={items}
        value={value}
        onValueChange={(next: string) => setValue(next)}
        itemToStringValue={(row: SearchResult) => row.label}
        filter={null}
        mode="list"
        open={open}
        onOpenChange={(nextOpen: boolean) => {
          if (!nextOpen) dismiss();
        }}
      >
        <Combobox.Field
          ref={inputRef}
          data-search-input
          aria-label="Search"
          className="nav-search w-[480px] max-lg:w-full"
          prompt={<span className="shrink-0 font-mono text-ui font-bold text-isk">&gt;</span>}
          trailing={<SearchHints active={active} />}
          type="text"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          autoComplete="off"
          placeholder="Search tools, sites, resources…"
          onFocus={() => onActiveChange(true)}
        />

        {open && (
          <Combobox.Panel className="w-[min(640px,92vw)]" sideOffset={8}>
            <Combobox.List>
              {sections.map((section) => (
                <Combobox.Group key={section.name}>
                  <Combobox.GroupLabel>
                    <span>{section.name}</span>
                    {section.name === 'Sites' && section.results.length > 0 && (
                      <span className="font-normal text-muted">
                        {section.results.length} match{section.results.length === 1 ? '' : 'es'}
                      </span>
                    )}
                  </Combobox.GroupLabel>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-1">
                    {section.results.map((row) => (
                      <SearchRow key={row.id} row={row} fireResult={fireResult} />
                    ))}
                  </div>
                </Combobox.Group>
              ))}
            </Combobox.List>
            <SearchFooter />
          </Combobox.Panel>
        )}
      </Combobox.Root>
    </div>
  );
}

function SearchHints({ active }: { active: boolean }) {
  const chip =
    'shrink-0 rounded-ctl border border-border bg-surface-raised px-[5px] py-px font-mono text-micro text-muted';
  return <span className={chip}>{active ? 'esc' : '⌘K'}</span>;
}

// The row's leading icon: the type's rendered image (falling back to a mono glyph
// on a 404), or a tone-coloured class/kind badge for rows without a type image.
function SearchRowIcon({ row }: { row: SearchResult }) {
  if (row.typeId) {
    return <TypeIcon typeId={row.typeId} size={22} mono={row.iconText ?? row.label.slice(0, 2)} />;
  }
  return (
    <span
      className={cn(
        'flex size-icon-lg shrink-0 items-center justify-center rounded-ctl border font-mono text-ui font-bold',
        searchIconClass(row.iconTone),
      )}
    >
      {row.iconText}
    </span>
  );
}

function SearchRow({
  row,
  fireResult,
}: {
  row: SearchResult;
  fireResult: (result: SearchResult) => void;
}) {
  return (
    <Combobox.Item
      value={row}
      disabled={row.disabled}
      onClick={() => fireResult(row)}
      className={cn(
        'group flex items-center gap-2.5 border border-border-soft bg-section px-2.5 py-2',
        'data-[highlighted]:border-border-active',
        row.disabled && 'opacity-55',
      )}
    >
      <SearchRowIcon row={row} />
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate font-mono text-ui text-name">
          {renderLabel(row.label, row.matchIndices)}
        </span>
        {row.sub && (
          <span className="truncate font-mono text-label uppercase tracking-[0.07em] text-muted">
            {row.sub}
          </span>
        )}
      </span>
      <span className="shrink-0 text-ui text-isk opacity-0 group-data-[highlighted]:opacity-100">↵</span>
    </Combobox.Item>
  );
}

// Walk the label into matched / unmatched runs (matched chars green, adjacent
// matches collapse into one run) — see {@link splitMatchRuns}.
function renderLabel(label: string, indices?: number[]) {
  return (
    <>
      {splitMatchRuns(label, indices).map((run, i) =>
        run.matched ? (
          <span key={i} className="font-semibold text-isk">
            {run.text}
          </span>
        ) : (
          <Fragment key={i}>{run.text}</Fragment>
        ),
      )}
    </>
  );
}

function SearchFooter() {
  return (
    <div className="mt-1 flex items-center justify-between border-t border-border-soft px-2.5 pb-1 pt-2 text-label uppercase tracking-control text-faint">
      <span>
        Scope: <span className="text-isk">all</span> · sites · tools · commands
      </span>
      <span className="flex gap-1">
        <Kbd>↑↓</Kbd>
        <Kbd>↵</Kbd>
        <Kbd>esc</Kbd>
      </span>
    </div>
  );
}
